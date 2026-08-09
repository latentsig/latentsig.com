---
title: "Latent Signals: what model internals tell us before the loss curve does"
subtitle: "A practical primer on activation probing during fine-tuning runs, and the early signals that predict whether your model is actually learning what you think it is."
author: "Latentsig AI Research"
date: "May 2026"
reading_time: "18 min"
status: "Research feature · practitioner synthesis"
---

# Latent Signals: what model internals tell us before the loss curve does

Fine-tuning dashboards are built around observables: training loss, validation loss, reward, benchmark scores, and samples. These measurements matter. But each compresses a complicated learning process into either a scalar or a handful of outputs. Two runs can reach nearly identical loss while learning very different internal solutions: one may organize a robust representation of the target concept; the other may exploit formatting cues, memorize the training distribution, or damage capabilities that the benchmark never exercises.

Activation probing gives us a second instrument panel. Instead of asking only *what did the model output?*, it asks *what information is linearly recoverable from the model's hidden states, at which layers, and how did that geometry change across checkpoints?*

The important word is **recoverable**. A probe shows that information is present in a representation. It does not prove that the model uses that information to produce its answer. That distinction is the difference between careful model science and an attractive but unsupported story.

This article develops a practical monitoring protocol for supervised fine-tuning (SFT), LoRA, continued pre-training, and preference optimization on open-weight language models. The claim is deliberately bounded:

> Activation measurements can provide earlier and more diagnostic evidence of target acquisition, shortcut learning, and collateral representation drift than aggregate loss alone. They are not universal predictors. Correlation must be followed by controls and transfer tests, with causal intervention added where the risk justifies it.

<figure class="research-figure signal-figure">
  <div class="figure-heading"><span>Figure 1</span><b>One objective curve can conceal two different learning stories</b></div>
  <svg viewBox="0 0 920 360" role="img" aria-labelledby="curve-title curve-desc">
    <title id="curve-title">Schematic comparison of loss and probe trajectories</title>
    <desc id="curve-desc">Two runs have similar falling loss, while only one has rising out-of-distribution target probe performance.</desc>
    <defs><linearGradient id="area-a" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8083ff" stop-opacity=".24"/><stop offset="1" stop-color="#8083ff" stop-opacity="0"/></linearGradient></defs>
    <g class="grid-lines"><path d="M70 45H880M70 105H880M70 165H880M70 225H880M70 285H880"/><path d="M70 45V285M230 45V285M390 45V285M550 45V285M710 45V285M880 45V285"/></g>
    <g class="axes"><path d="M70 40V285H885"/><text x="75" y="25">HIGH</text><text x="75" y="315">CHECKPOINT →</text></g>
    <path class="loss-a" d="M72 77C160 91 205 132 292 161S460 218 562 240 751 262 878 268"/>
    <path class="loss-b" d="M72 84C155 99 218 127 300 166S467 220 573 239 755 259 878 266"/>
    <path class="probe-area" d="M72 265C181 259 240 251 320 220S446 149 548 112 742 76 878 65V285H72Z"/>
    <path class="probe" d="M72 265C181 259 240 251 320 220S446 149 548 112 742 76 878 65"/>
    <path class="shortcut" d="M72 264C208 262 300 250 399 238S569 227 690 220 805 214 878 211"/>
    <g class="figure-labels"><rect x="638" y="44" width="210" height="54" rx="8"/><circle cx="660" cy="63" r="4" class="dot-good"/><text x="675" y="68">target transfer rises</text><circle cx="660" cy="82" r="4" class="dot-bad"/><text x="675" y="87">shortcut stays flat</text></g>
    <g class="annotation"><path d="M365 212L310 177"/><circle cx="307" cy="175" r="4"/><text x="372" y="207">representation separates</text><text x="372" y="226">before loss distinguishes runs</text></g>
  </svg>
  <figcaption><b>Schematic, not experimental data.</b> Plot target and transfer probes against the same checkpoints as loss. Similar objective values need not imply similar representation quality.</figcaption>
</figure>

## Why loss is necessary but structurally incomplete

Cross-entropy loss measures how much probability the model assigns to the desired next tokens. It does not identify the internal computation that produced that probability. Averaging the objective across tokens and examples hides at least four distinctions that matter in production:

1. **Capability versus expression.** A concept may become internally decodable before it is consistently expressed in generated text. Conversely, an output metric may improve through a shallow response policy while the underlying representation remains brittle.
2. **Generalization versus shortcuts.** A run can lower loss by learning source, template, length, or label-position cues that disappear outside the training format.
3. **Acquisition versus retention.** The target task can improve while unrelated knowledge, calibration, multilingual structure, or refusal behavior degrades.
4. **Where learning happens.** The same final metric can arise from small, localized changes or from broad representational reorganization.

This is not an argument to replace behavioral evaluation. It is an argument to stop treating one scalar as a complete account of learning.

Recent work makes the practical case concrete. An April 2026 study used lightweight probes on OLMo 3 7B training checkpoints to predict downstream pass@1 with average AUROC above 0.75, reducing the reported evaluation latency from roughly one hour to roughly three minutes. The evidence is specific to this model and task, so it is not a general law. It does show that checkpoint activations can carry useful performance information before expensive generation-based evaluation completes.[^intraining]

OpenAI's study of emergent misalignment supplies a different kind of signal. After fine-tuning GPT-4o variants on narrow incorrect-answer datasets, the researchers found a sparse-autoencoder latent associated with a “misaligned persona” whose activation change predicted broader misalignment. More importantly, suppressing that feature reduced misaligned behavior, moving the result beyond passive correlation.[^emergent]

## What an activation probe actually measures

For an input sequence `x`, a transformer produces a hidden vector `h[l,t](x) ∈ ℝᵈ` at layer `l` and token position `t`. A binary linear probe fits a small classifier:

<div class="equation" role="math" aria-label="The probability that y equals one given h equals sigma of w transpose h plus b">p(y = 1 | h) = σ(w<sup>T</sup>h + b)</div>

The base model is frozen while the probe is trained. If the probe performs well on genuinely held-out examples, the label is **linearly decodable** from that activation site. Linear probes are intentionally weak: their simplicity reduces the chance that the diagnostic model learns the task independently of the representation. The method descends from early work using linear classifiers to inspect intermediate neural-network layers and from a large probing literature in NLP.[^alain][^belinkov]

Three choices determine what the result means:

- **The label.** Probe a concept with operational relevance: policy compliance, groundedness, domain membership, answer correctness, tool intent, uncertainty, or a known failure mode, rather than a vague anthropomorphic state.
- **The activation site.** The residual stream after a transformer block is the most portable default. The final prompt token is convenient, but span pooling or the answer-decision token may be better. Token choice can dominate the result.
- **The split.** A random split tests interpolation. A source-, template-, entity-, or time-disjoint split tests whether the direction survives the confounds you actually care about.

Representations can contain striking linear structure. Marks and Tegmark found truth-related directions in Llama 2 that generalized across several true/false datasets and, in some settings, causally affected outputs when activations were shifted along them.[^truth] Gurnee and Tegmark similarly decoded spatial and temporal attributes from Llama 2 hidden states while explicitly noting that decodability does not imply use.[^spacetime] These results justify probing as an instrument. They do not justify treating every high AUROC as a discovered mechanism.

## A frontier-model reality check

Activation probing requires the forward pass or a provider-supported internal telemetry interface. In practice, that separates the model landscape into two regimes.

**Open-weight models are directly probeable.** As of May 2026, representative frontier or near-frontier families include Qwen 3.5, Llama 4 Scout and Maverick, DeepSeek V4, Mistral Large 3, and Gemma 3. Their weights can be run in an instrumented framework and their layer outputs captured. Hugging Face Transformers, for example, exposes per-layer hidden states through `output_hidden_states=True`.[^hf]

**Closed frontier APIs are not directly probeable by customers.** GPT, Claude, and Gemini providers publish valuable internal research, but their public generation APIs do not expose the full residual stream or arbitrary internal activations. OpenAI's GPT-4 sparse-autoencoder work and emergent-misalignment study, and Anthropic's feature and circuit-tracing work on Claude, should therefore be read as provider-run experiments, not recipes an API customer can reproduce on those same production models.[^gpt4sae][^claude]

<figure class="research-figure embedded-figure access-figure">
  <div class="figure-heading"><span>Figure 2</span><b>Activation access, not benchmark rank, determines probeability</b></div>
  <div class="access-grid" role="table" aria-label="Model activation access matrix">
    <div class="access-row access-head" role="row"><span role="columnheader">Model family</span><span role="columnheader">Weights</span><span role="columnheader">Customer activations</span><span role="columnheader">Practical status</span></div>
    <div class="access-row" role="row"><span role="cell">Qwen 3.5</span><span role="cell" class="yes">Open</span><span role="cell" class="yes">Full forward hooks</span><span role="cell">Directly probeable</span></div>
    <div class="access-row" role="row"><span role="cell">Llama 4</span><span role="cell" class="yes">Open</span><span role="cell" class="yes">Full forward hooks</span><span role="cell">Track MoE routing</span></div>
    <div class="access-row" role="row"><span role="cell">DeepSeek V4</span><span role="cell" class="yes">Open</span><span role="cell" class="yes">Full forward hooks</span><span role="cell">Track MoE routing</span></div>
    <div class="access-row" role="row"><span role="cell">Mistral Large 3</span><span role="cell" class="yes">Open</span><span role="cell" class="yes">Full forward hooks</span><span role="cell">High compute cost</span></div>
    <div class="access-row" role="row"><span role="cell">Gemma 3</span><span role="cell" class="yes">Open</span><span role="cell" class="yes">Hooks + Scope 2</span><span role="cell">Strongest SAE tooling</span></div>
    <div class="access-row" role="row"><span role="cell">GPT · Claude · Gemini</span><span role="cell" class="no">Closed</span><span role="cell" class="no">Not in public APIs</span><span role="cell">Provider research only</span></div>
  </div>
  <figcaption><b>Landscape frozen to May 2026.</b> “Open” describes weight access, not necessarily OSI open-source status; licenses and acceptable-use terms still apply.</figcaption>
</figure>

Architecture changes also affect the protocol:

- **Mixture-of-experts models** such as Llama 4 Maverick, DeepSeek V4, and Mistral Large 3 can change routing as well as residual geometry. Record router statistics if the implementation exposes them; otherwise a probe may detect a routing change without explaining it.
- **Hybrid-attention models** such as Qwen 3.5 mix linear and full-attention blocks. Comparing “layer 24” across unrelated architectures is rarely meaningful; compare normalized depth and inspect architectural boundaries.
- **Multimodal models** require modality-aware controls. A text label that correlates with image resolution, crop, or placeholder-token count will produce an impressive but useless probe.
- **Gemma 3 has an unusually strong interpretability ecosystem.** Gemma Scope 2 publishes sparse autoencoders and transcoders across Gemma 3 layers, making it a practical testbed when concept-level feature inspection matters more than raw frontier performance.[^gemmascope]

## The checkpoint protocol we recommend

The most useful probe is not a post-hoc classifier on one final model. It is a time series collected under a frozen measurement protocol.

<figure class="research-figure embedded-figure protocol-figure">
  <div class="figure-heading"><span>Figure 3</span><b>The checkpoint observability loop</b></div>
  <div class="protocol-flow" role="img" aria-label="Fine-tuning checkpoints flow through a fixed activation dataset into frozen hidden states, probes, controls, and a training decision">
    <div class="flow-node"><small>TRAIN</small><strong>Fine-tuning run</strong><span>step 0 · 50 · 100 · …</span></div>
    <i>→</i>
    <div class="flow-node"><small>EXTRACT</small><strong>Frozen eval batch</strong><span>same prompts · sites · tokens</span></div>
    <i>→</i>
    <div class="flow-node"><small>MEASURE</small><strong>Hidden states</strong><span>layer × token × checkpoint</span></div>
    <i>→</i>
    <div class="flow-node flow-accent"><small>DECIDE</small><strong>Probe panel</strong><span>target · transfer · retention</span></div>
  </div>
  <div class="protocol-return"><span>continue</span><span>inspect shortcuts</span><span>reduce training pressure</span><span>stop / select checkpoint</span></div>
  <figcaption>The protocol is fixed before training. The output is a joint trajectory, not a single “interpretability score.”</figcaption>
</figure>

### 1. Define the hypothesis before the run

Write down the representation-level change you expect. For example:

> “Positive, evidence-grounded answers will become more separable from plausible unsupported answers in middle-to-late residual-stream layers, and the direction will transfer to a held-out source.”

Also define what must *not* change: general-domain calibration, refusal separation, multilingual alignment, or a control task unrelated to the fine-tuning objective.

### 2. Build four small, fixed datasets

- **Target set:** balanced positives and negatives for the desired capability.
- **Transfer set:** the same semantic distinction expressed through different sources, templates, entities, or domains.
- **Confound set:** deliberately breaks correlations with answer length, source, formatting, vocabulary, and label position.
- **Retention set:** measures capabilities and safety properties the run should preserve.

Hundreds of carefully paired examples often tell you more than thousands of weak labels. Counterfactual pairs are especially valuable: change the property of interest while keeping surface form as constant as possible.

### 3. Save checkpoints densely near the beginning

Always include step 0. Early updates often produce the largest directional changes, especially with high learning rates or small adapters. A practical schedule might save every 25–100 optimizer steps initially, then less frequently after the probe trajectory stabilizes. The right cadence depends on run length and checkpoint cost; the invariant is that “before” must be measured, not reconstructed.

### 4. Extract the same sites every time

Start with the residual stream at roughly 25%, 50%, and 75% of model depth, plus the final block. Use one token-selection rule throughout. Store activations in float32 even if inference runs in lower precision. Keep prompts, chat templates, truncation, padding, pooling, and tokenizer versions identical across checkpoints.

For each checkpoint, record:

- probe AUROC or Matthews correlation on target and transfer sets;
- calibration error, not only ranking accuracy;
- a control-task score or probe selectivity;
- representation similarity to step 0 (linear CKA is a useful summary);[^cka]
- activation RMS and outlier rates by layer;
- cosine similarity of probe directions across checkpoints;
- behavioral accuracy and loss on the same examples.

<figure class="research-figure embedded-figure heatmap-figure">
  <div class="figure-heading"><span>Figure 4</span><b>Where and when a representation becomes decodable</b></div>
  <div class="heatmap-wrap">
    <div class="heatmap-y"><span>late</span><span>¾</span><span>½</span><span>¼</span><span>early</span></div>
    <div class="heatmap" role="img" aria-label="Schematic heatmap of probe transfer across model depth and training checkpoints">
      <span style="--v:.08"></span><span style="--v:.10"></span><span style="--v:.14"></span><span style="--v:.20"></span><span style="--v:.26"></span><span style="--v:.34"></span><span style="--v:.42"></span><span style="--v:.48"></span>
      <span style="--v:.06"></span><span style="--v:.12"></span><span style="--v:.24"></span><span style="--v:.40"></span><span style="--v:.60"></span><span style="--v:.72"></span><span style="--v:.78"></span><span style="--v:.82"></span>
      <span style="--v:.04"></span><span style="--v:.10"></span><span style="--v:.32"></span><span style="--v:.64"></span><span style="--v:.84"></span><span style="--v:.92"></span><span style="--v:.96"></span><span style="--v:.98"></span>
      <span style="--v:.03"></span><span style="--v:.07"></span><span style="--v:.18"></span><span style="--v:.36"></span><span style="--v:.52"></span><span style="--v:.62"></span><span style="--v:.66"></span><span style="--v:.67"></span>
      <span style="--v:.02"></span><span style="--v:.03"></span><span style="--v:.05"></span><span style="--v:.08"></span><span style="--v:.12"></span><span style="--v:.14"></span><span style="--v:.15"></span><span style="--v:.16"></span>
    </div>
    <div class="heatmap-x"><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>250</span><span>300</span><span>350</span><b>checkpoint →</b></div>
  </div>
  <figcaption><b>Schematic, not experimental data.</b> Layer × checkpoint maps reveal onset, localization, migration, and collapse that a best-layer score would hide.</figcaption>
</figure>

### 5. Use two complementary probe modes

**Per-checkpoint probes** measure whether the concept is decodable at each checkpoint even if the representation rotates. Use fixed hyperparameters and nested validation; do not tune a new probe family at every step.

**Cross-checkpoint probes** train a direction on one checkpoint and evaluate it on the others. They reveal whether the same feature direction persists, appears, rotates, or collapses. A final-checkpoint probe evaluated backward can visualize when the final representation became recognizable, but it must be labeled as a retrospective diagnostic.

Do not select the best layer separately at each checkpoint and then plot those maxima. That manufactures a clean trend from repeated multiple comparisons. Pre-register layers or correct for selection.

### 6. Escalate promising signals up the evidence ladder

Use a three-level standard:

1. **Decodability:** the probe works on held-out IID data.
2. **Transfer:** the same direction works across sources, formats, prompts, or domains and beats matched controls.
3. **Causality:** activation patching, ablation, erasure, or steering changes the relevant behavior selectively.

<figure class="research-figure embedded-figure ladder-figure">
  <div class="figure-heading"><span>Figure 5</span><b>The evidence ladder</b></div>
  <div class="evidence-ladder">
    <div><span>01</span><strong>Decodable</strong><small>Held-out probe performance</small><b>“information is present”</b></div>
    <div><span>02</span><strong>Transferable</strong><small>New sources, formats, domains</small><b>“not an obvious shortcut”</b></div>
    <div><span>03</span><strong>Causally implicated</strong><small>Selective patch, erase, or steer</small><b>“information affects behavior”</b></div>
  </div>
  <figcaption>Each step licenses a stronger claim. High AUROC alone never reaches the top rung.</figcaption>
</figure>

Hewitt and Liang showed why control tasks matter: a high-capacity probe can memorize associations rather than expose structure in the representation.[^controls] More recent results reinforce the warning. Probe accuracy can reflect format rather than the cognitive property named by the researcher. A probe earns a stronger interpretation only as it survives deconfounding, transfer, and intervention.

## Reading the signals

The useful object is not one score but the joint trajectory.

<figure class="research-figure embedded-figure matrix-figure">
  <div class="figure-heading"><span>Figure 6</span><b>Interpret probe movement together with representation retention</b></div>
  <div class="decision-matrix" role="img" aria-label="Decision matrix of target probe improvement against retention stability">
    <div class="matrix-axis matrix-y">Target signal →</div>
    <div class="matrix-cell"><small>HIGH DRIFT · LOW TARGET</small><strong>Run damage</strong><span>Stop; inspect learning rate, data, and hooks.</span></div>
    <div class="matrix-cell good"><small>LOW DRIFT · HIGH TARGET</small><strong>Healthy acquisition</strong><span>Confirm transfer, then behavior.</span></div>
    <div class="matrix-cell"><small>LOW DRIFT · LOW TARGET</small><strong>No useful learning</strong><span>Revisit labels, site, or objective.</span></div>
    <div class="matrix-cell warn"><small>HIGH DRIFT · HIGH TARGET</small><strong>Over-specialization</strong><span>Reduce training pressure; test retention.</span></div>
    <div class="matrix-axis matrix-x">Representation drift →</div>
  </div>
  <figcaption>A target probe can improve while the base model is being broadly damaged. Retention belongs on the same dashboard.</figcaption>
</figure>

### Healthy acquisition

Target and transfer AUROC rise together; the direction becomes stable across checkpoints; behavioral performance follows; retention CKA remains high outside a localized band of layers. This suggests that the run is organizing a reusable representation rather than merely fitting surface tokens.

### Shortcut acquisition

IID probe performance rises while the transfer set is flat and the confound probe also becomes strong. Loss may look excellent. Stop and inspect source, template, length, and label leakage. A shortcut direction can be perfectly linear.

### Latent acquisition without expression

The target becomes decodable, but generated answers do not improve. The model may possess the signal while the output policy suppresses or fails to use it. Instruction tuning can preserve information that direct generation refuses to reveal, which is why “the model does not say it” and “the model does not represent it” are different hypotheses.[^refused]

### Behavioral improvement without a probe signal

The behavior improves while the chosen probe remains flat. The model may use a nonlinear, distributed, token-local, or different-layer representation; or the task may be solved by a shallow output heuristic. Change the measurement site before concluding that no representation changed.

### Collateral drift

The target probe improves, but retention probes deteriorate, activation norms spike, or CKA falls broadly across layers. This is the representation-level signature of over-specialization or catastrophic interference. Reduce the learning rate, adapter rank, number of trainable layers, or training duration; mix in retention data; and rerun from a clean checkpoint.

### Direction churn

Per-checkpoint probes score well but cross-checkpoint transfer is poor and directions rotate rapidly. The concept is repeatedly decodable but encoded unstably. This can occur during normal early adaptation, but persistent churn is a warning for fragile generalization and makes fixed monitors unreliable.

## Linear probes versus sparse autoencoders

These tools answer different questions.

A **supervised linear probe** asks whether a predefined label is recoverable. It is cheap, fast, and ideal for checkpoint monitoring. Its interpretation is limited by the labels and controls.

A **sparse autoencoder (SAE)** learns a large dictionary of recurring activation directions without concept labels, then expresses each activation as a small set of features. SAEs are useful for discovering changes you did not specify in advance and for attaching human-readable hypotheses to them. They are substantially more expensive and introduce reconstruction error and feature-validation problems.

OpenAI trained a 16-million-feature SAE on GPT-4 activations but emphasized that the reconstructed model suffered a large capability penalty and that many features remained difficult to interpret.[^gpt4sae] Google DeepMind's original Gemma Scope trained more than 400 SAEs across Gemma 2 layers and reported roughly 20 PiB of stored activations. That scale is a useful reminder that exhaustive feature dictionaries are not the lightweight option.[^gemmascope1]

For ordinary fine-tuning observability, begin with supervised probes and representation statistics. Add an SAE when an unexpected drift signal deserves discovery work, or when a validated pretrained dictionary already exists for the exact base model and activation site.

## Key considerations and potential blind spots

The protocol becomes dangerous when a convenient measurement is mistaken for the underlying phenomenon. Four constraints deserve explicit treatment in production.

### A flat linear probe can be a false negative

Linear probing tests a specific hypothesis: that the target property is recoverable through a hyperplane at a chosen activation site. Many semantic features appear approximately linear, but the linear representation hypothesis is not guaranteed for every property or every coordinate system.[^linearrep] A feature may be nonlinearly encoded, distributed across several token positions, or only recoverable from interactions among attention-head and MLP outputs.

Consequently, a flat score means **“not linearly decodable here, with this dataset and pooling rule.”** It does not mean “the model does not represent the feature.” The XOR example below is the smallest visual demonstration: the label is perfectly determined by the two coordinates, but no single straight decision boundary can separate the classes.

<figure class="research-figure embedded-figure xor-figure">
  <div class="figure-heading"><span>Figure 7</span><b>Example: information can be present but not linearly separable</b></div>
  <svg viewBox="0 0 820 330" role="img" aria-labelledby="xor-title xor-desc">
    <title id="xor-title">Linear and nonlinear probes on an XOR representation</title>
    <desc id="xor-desc">Four clusters form an XOR pattern. No straight line separates violet positive clusters from amber negative clusters, while a curved boundary can.</desc>
    <g class="xor-panel">
      <text class="xor-kicker" x="45" y="32">LINEAR PROBE</text><text class="xor-result" x="45" y="55">flat / chance</text>
      <path class="xor-axis" d="M55 275V78M55 275H360"/>
      <circle class="xor-pos" cx="120" cy="220" r="13"/><circle class="xor-pos" cx="292" cy="125" r="13"/>
      <circle class="xor-neg" cx="120" cy="125" r="13"/><circle class="xor-neg" cx="292" cy="220" r="13"/>
      <path class="xor-line" d="M75 255L330 93"/><text class="xor-note" x="130" y="298">no straight boundary works</text>
    </g>
    <path class="xor-divider" d="M410 25V305"/>
    <g class="xor-panel">
      <text class="xor-kicker" x="455" y="32">NONLINEAR CONTROL</text><text class="xor-result good" x="455" y="55">feature recovered</text>
      <path class="xor-axis" d="M465 275V78M465 275H770"/>
      <circle class="xor-pos" cx="530" cy="220" r="13"/><circle class="xor-pos" cx="702" cy="125" r="13"/>
      <circle class="xor-neg" cx="530" cy="125" r="13"/><circle class="xor-neg" cx="702" cy="220" r="13"/>
      <path class="xor-curve" d="M488 187C555 160 600 160 640 180S717 211 750 178"/>
      <text class="xor-note" x="535" y="298">interaction term separates labels</text>
    </g>
  </svg>
  <figcaption><b>Synthetic example.</b> Use a small nonlinear probe only as a sensitivity analysis. If it succeeds, you have evidence of recoverable information, not permission to replace the operational monitor with an unconstrained network.</figcaption>
</figure>

### High dimensions make overfitting easy

Residual-stream widths commonly run into thousands of dimensions. With a small probe dataset, the number of examples can be far below the number of candidate features. A linear classifier can then find a separating direction through noise, even without an MLP.

Treat strict regularization and capacity controls as part of the measurement, not optional cleanup:

- standardize activations using training-fold statistics only;
- tune an `L₂` or ridge penalty inside nested cross-validation;
- report repeated group-disjoint splits and confidence intervals;
- compare against permuted labels, random features, and control tasks;
- prefer a difference-in-means or shrinkage baseline when samples are scarce;
- never choose the layer, token site, and penalty on the final test set.

There is no universal minimum sample count. `N < 1,000` is a useful warning flag, not a theorem: effective dimensionality, class balance, regularization, correlations, and split difficulty matter more than the raw threshold.

### Token site and pooling are part of the hypothesis

The residual vector `h[l,t]` can differ sharply across the entity token, final prompt token, first generated token, and a pooled span. Decoder-only transformers route information causally from left to right, and the location that best summarizes a property can change with depth. Initial tokens can also attract disproportionate attention as “attention sinks,” a documented phenomenon that is not necessarily semantic.[^sinks]

Do a small site-ablation study before freezing the production monitor. Compare a predeclared set of plausible sites, test whether the direction transfers across prompt lengths and chat templates, and then lock one rule. If the best site migrates between checkpoints, report the migration rather than hiding it behind max pooling.

### SAE latents can be cleaner, but they are not ground truth

Raw residual directions can blend multiple features in superposition: a model may represent more sparse features than it has dimensions, allowing directions and neurons to participate in several concepts.[^superposition] When a validated dictionary exists for the exact model, layer, and hook point, probing SAE latent activations can produce sparser and more interpretable candidate signals. Gemma Scope 2 is especially useful here because it provides SAEs and transcoders across Gemma 3 layers.[^gemmascope]

But “SAE latent” is not synonymous with “monosemantic concept.” Dictionaries have reconstruction error, splitting and absorption effects, dead features, and sensitivity to training data and sparsity settings. Fine-tuning can also move the activation distribution away from the one used to train the dictionary. Track SAE reconstruction quality at every checkpoint and fall back to raw residual probes if the dictionary no longer faithfully reconstructs the states being monitored.

<figure class="research-figure embedded-figure blindspot-figure">
  <div class="figure-heading"><span>Figure 8</span><b>A production sensitivity panel: change one measurement assumption at a time</b></div>
  <div class="blindspot-grid">
    <div class="blind-card sample-card"><small>CAPACITY</small><strong>Example: N = 256 · d = 4,096</strong><div class="ratio-track"><span></span></div><p>Sixteen candidate dimensions per example. Use ridge, grouped splits, permutation controls.</p></div>
    <div class="blind-card token-card"><small>SITE</small><strong>Where is the signal?</strong><div class="token-sequence"><span>system</span><span class="hot-1">entity</span><span>context</span><span class="hot-2">final prompt</span><span class="hot-3">first output</span></div><p>Repeat across depth; freeze the rule only after a site-ablation study.</p></div>
    <div class="blind-card dictionary-card"><small>BASIS</small><strong>Residual → SAE dictionary</strong><div class="dictionary-flow"><span class="dense">dense h</span><i>→</i><span class="sparse">sparse latents</span></div><p>Cleaner candidates only if reconstruction fidelity remains stable after fine-tuning.</p></div>
  </div>
  <figcaption><b>Diagnostic example, not a universal threshold.</b> A trustworthy monitor survives reasonable changes in probe capacity, token site, split construction, and representation basis.</figcaption>
</figure>

## Failure modes that invalidate a probe dashboard

- **Token leakage:** the label or a deterministic proxy is present in the prompt or answer token used for pooling.
- **Template leakage:** positives and negatives use different system prompts, punctuation, or response lengths.
- **Probe overfitting:** feature dimension is large, sample count is small, and regularization was tuned on the test set.
- **Layer fishing:** dozens of layers, tokens, and pooling rules were tried, but only the best result is reported.
- **Checkpoint leakage:** examples or probe hyperparameters were selected after inspecting the final model.
- **Quantization mismatch:** checkpoints are compared under different precision or kernels, shifting activations independently of learning.
- **Adapter mismatch:** the hook captures the base module output before the LoRA update rather than the post-adapter residual.
- **Causal overclaim:** a decodable direction is described as “the mechanism” without intervention.

The cure is unglamorous: paired data, frozen splits, fixed extraction code, negative controls, uncertainty intervals, and a written decision rule.

## A minimal decision rule for real runs

Before training, choose a target metric \(T\), an out-of-distribution transfer metric \(G\), a retention metric \(R\), and a behavioral metric \(B\). Define thresholds from repeated baseline extractions and at least one known-good run, rather than from the current run's most flattering checkpoint.

A practical gate might read:

- continue while \(T\) and \(G\) improve and \(R\) stays within its baseline tolerance;
- investigate if \(T\) improves but \(G\) does not;
- reduce training pressure if \(R\) crosses its drift threshold;
- accept a checkpoint only when probe evidence and behavioral evidence agree on held-out data;
- require a causal test before making a safety-critical claim about a discovered direction.

This turns interpretability from a post-hoc narrative into an operational control loop.

## What model internals can and cannot tell us

Activation probing is most valuable in the gap between “the optimizer is working” and “the model has learned the right abstraction.” It can show that a distinction is becoming easier to read, that its encoding is moving through layers, that a direction transfers beyond the training format, or that unrelated structure is being erased. Those are actionable facts before the final benchmark report.

But a probe does not read a model's mind. Hidden states are high-dimensional computational objects, not sentences waiting to be translated. A clean separating hyperplane may identify a genuine reusable feature, a surface correlation, or a property that downstream computation ignores.

The disciplined stance is therefore neither skepticism nor spectacle. Measure the representation. Break the confounds. Test transfer. Intervene when the claim matters. Then put the loss curve back beside the latent signals and read them together.

---

## References

[^alain]: Guillaume Alain and Yoshua Bengio, [“Understanding intermediate layers using linear classifier probes”](https://arxiv.org/abs/1610.01644), 2016.
[^belinkov]: Yonatan Belinkov, [“Probing Classifiers: Promises, Shortcomings, and Advances”](https://aclanthology.org/J22-2001/), *Computational Linguistics*, 2022.
[^controls]: John Hewitt and Percy Liang, [“Designing and Interpreting Probes with Control Tasks”](https://arxiv.org/abs/1909.03368), EMNLP-IJCNLP 2019.
[^truth]: Samuel Marks and Max Tegmark, [“The Geometry of Truth: Emergent Linear Structure in Large Language Model Representations of True/False Datasets”](https://arxiv.org/abs/2310.06824), COLM 2024.
[^spacetime]: Wes Gurnee and Max Tegmark, [“Language Models Represent Space and Time”](https://arxiv.org/abs/2310.02207), ICLR 2024.
[^cka]: Simon Kornblith et al., [“Similarity of Neural Network Representations Revisited”](https://arxiv.org/abs/1905.00414), ICML 2019.
[^intraining]: Zhichen Liu et al., [“Fast and Accurate Probing of In-Training LLMs' Downstream Performances”](https://arxiv.org/abs/2604.01025), 2026 preprint.
[^emergent]: OpenAI, [“Toward understanding and preventing misalignment generalization”](https://openai.com/index/emergent-misalignment/), 2025; accompanying paper linked on the page.
[^gpt4sae]: Jeffrey Wu et al., [“Extracting Concepts from GPT-4”](https://openai.com/index/extracting-concepts-from-gpt-4/), 2024; [technical paper](https://arxiv.org/abs/2406.04093).
[^gemmascope1]: Google DeepMind, [“Gemma Scope: helping the safety community shed light on the inner workings of language models”](https://deepmind.google/blog/gemma-scope-helping-the-safety-community-shed-light-on-the-inner-workings-of-language-models/), 2024.
[^gemmascope]: Google DeepMind, [Gemma Scope and Gemma Scope 2](https://deepmind.google/models/gemma/gemma-scope/), accessed May 2026.
[^claude]: Anthropic, [“Tracing the thoughts of a large language model”](https://www.anthropic.com/research/tracing-thoughts-language-model), 2025; and [“Open-sourcing circuit-tracing tools”](https://www.anthropic.com/research/open-source-circuit-tracing), 2025.
[^refused]: Aryan Shrivastava and Ari Holtzman, [“Linearly Decoding Refused Knowledge in Aligned Language Models”](https://arxiv.org/abs/2507.00239), 2025.
[^hf]: Hugging Face, [Transformers model outputs documentation](https://huggingface.co/docs/transformers/main_classes/output), accessed May 2026.
[^linearrep]: Kiho Park, Yo Joong Choe, and Victor Veitch, [“The Linear Representation Hypothesis and the Geometry of Large Language Models”](https://arxiv.org/abs/2311.03658), 2023.
[^sinks]: Guangxuan Xiao et al., [“Efficient Streaming Language Models with Attention Sinks”](https://arxiv.org/abs/2309.17453), ICLR 2024.
[^superposition]: Nelson Elhage et al., [“Toy Models of Superposition”](https://transformer-circuits.pub/2022/toy_model/), 2022.

### Model-access sources (landscape frozen to May 2026)

- Qwen Team, [Qwen 3.5 model card](https://huggingface.co/Qwen/Qwen3.5-27B), February 2026.
- Meta AI, [“The Llama 4 herd”](https://ai.meta.com/blog/llama-4-multimodal-intelligence/), April 2025.
- DeepSeek, [Transparency Center](https://www.deepseek.com/en/transparency/), including DeepSeek V4, April 2026.
- Mistral AI, [“Introducing Mistral 3”](https://mistral.ai/news/mistral-3/), December 2025.
- Google, [“Introducing Gemma 3”](https://developers.googleblog.com/en/introducing-gemma3/), March 2025.

### Suggested implementation references

- Zhengxuan Wu et al., [“pyvene: A Library for Understanding and Improving PyTorch Models via Interventions”](https://arxiv.org/abs/2403.07809), 2024.
- Kevin Ro Wang et al., [“Interpretability in the Wild: a Circuit for Indirect Object Identification in GPT-2 Small”](https://arxiv.org/abs/2211.00593), ICLR 2023.
- Kenneth Li et al., [“Inference-Time Intervention: Eliciting Truthful Answers from a Language Model”](https://arxiv.org/abs/2306.03341), NeurIPS 2023.
