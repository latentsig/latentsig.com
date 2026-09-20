---
title: "Laya and RLCD: fast decisions for AI workflows"
subtitle: "How a bidirectional encoder, typed questions, and probability-focused training turn free-form state into decisions that software can use."
author: "Latentsig AI Research"
date: "September 2026"
reading_time: "12 min"
status: "Systems explainer"
---

# Laya and RLCD: fast decisions for AI workflows

Many AI workflows use a text-generation model to produce a small decision. A support router may need one queue name. A guardrail may need a probability. An agent supervisor may need a score on a fixed rubric. Modern chat models can constrain decoding to valid JSON, but they still generate the answer token by token. Laya scores the declared options directly.

[Laya](https://github.com/NandhaKishorM/laya), developed by ConvAI Innovations, takes a narrower path. It accepts a state and typed questions, then returns probability distributions and structured values without generating an explanation. Its checkpoints use bidirectional encoder backbones with a decision head. The model reads each question and state together, scores the allowed answers, and returns all requested decisions from one batched model call.

That design makes Laya useful to study even if a team never deploys its checkpoints. It shows where a compact decision model can sit beside a generative model, how calibrated probabilities differ from confident output, and why a fixed schema helps software without guaranteeing that the answer is correct.

<aside class="truth-note">
  <strong>The useful boundary</strong>
  <p>Laya constrains the shape of an answer. It can prevent an undeclared label or malformed response. It cannot make every allowed answer true.</p>
</aside>

## The System One idea, with a careful boundary

TypeSafe introduced Jev as a "System One model" for fast structured decisions. Its public interface sends unstructured state plus typed questions and returns values and probability distributions that code can branch on. TypeSafe calls its training method Reinforcement Learning for Calibrated Decisions, or RLCD. [Its launch post describes parallel outputs and typed schemas](https://typesafe.ai/blog/introducing-system-one-models-and-jev), while [the product documentation defines choice, score, and noul questions](https://docs.typesafe.ai/introduction).

Laya uses the same three question shapes and the same expansion of RLCD. It also publishes model weights and runtime code. This makes its concrete implementation open to inspection. The available TypeSafe material does not establish that Jev and Laya share an internal architecture, so the comparison should stop at the product pattern unless more evidence appears.

"System One" comes from a cognitive metaphor for fast judgment. The paired System Two describes slower, deliberate investigation. [Kahneman's Nobel lecture develops this distinction](https://www.nobelprize.org/uploads/2018/06/kahnemann-lecture.pdf). Here the label means a model optimized for bounded decisions rather than token generation. It does not mean that the encoder works like a biological reflex system, and it does not establish equivalence with human cognition.

This changes the division of labor in an AI system. A generative model can plan, explain, retrieve, or write. A decision model can classify a request, estimate a rubric level, or decide whether a costly path should run. The surrounding application remains responsible for policy, authorization, validation, and fallback behavior.

## What changes for builders

Efficient encoders, classifiers, and probability scoring all predate Laya. The distinctive combination is a typed API, option descriptions supplied at request time, direct option scoring, and training that rewards distributions. A builder can ask several small questions without defining a permanent classifier head for each label set. That flexibility is the claim to test. A conventional supervised encoder remains an essential baseline, and the published evidence does not isolate gains from reinforcement learning alone.

## What enters the encoder

Laya does not send an open-ended prompt to a decoder. For each question, its runtime constructs a sequence with a classification token, instructions, masked option markers, serialized state, and separators. The [sequence builder in the pinned source](https://github.com/NandhaKishorM/laya/blob/d113dca2512fb3eaca313534bc54c7162d87c1d4/laya/common.py) reserves part of the context budget for the question and options.

<figure class="system-figure encoder-figure">
  <div class="figure-heading"><span>Figure 1</span><b>One question becomes one encoder sequence</b></div>
  <div class="sequence-shell" role="img" aria-label="A state and three typed questions become three separate sequences, which are batched into one encoder call">
    <div class="input-state"><small>SHARED APPLICATION STATE</small><strong>Ticket, trace, email, or JSON document</strong></div>
    <div class="sequence-list">
      <div><span class="type choice">choice</span><code>[CLS] question [SEP] [MASK] option ... [SEP] state</code></div>
      <div><span class="type score">score</span><code>[CLS] question [SEP] [MASK] level ... [SEP] state</code></div>
      <div><span class="type noul">noul</span><code>[CLS] question [SEP] [MASK] false [MASK] true [SEP] state</code></div>
    </div>
    <div class="batch-node"><small>ONE BATCHED CALL</small><strong>Bidirectional encoder</strong><span>Three sequences in this example</span></div>
    <div class="pipeline-arrow">↓</div>
    <div class="head-flow">
      <div><small>TYPED HEAD</small><strong>Type embedding plus transformer layers</strong></div><i>→</i>
      <div><small>OPTION MARKERS</small><strong>One logit per answer</strong></div><i>→</i>
      <div><small>RUNTIME</small><strong>Temperature plus typed result</strong></div>
    </div>
  </div>
  <figcaption>The runtime repeats the serialized state inside each question sequence. "One forward pass" means one batched model invocation, not one shared state representation reused by every question.</figcaption>
</figure>

This detail matters in production planning. Adding questions can use parallel hardware well, but it still adds sequences and tokens to the batch. Latency will not be perfectly constant. State length, the number of questions, option count, checkpoint, device, and batch shape all affect cost.

Every allowed answer gets its own masked position. Laya gathers the hidden state at each marker and turns it into one scalar logit. A softmax across the logits produces the answer distribution. The [model card's architecture section](https://huggingface.co/convaiinnovations/laya#architecture) describes the learned decision head and option-marker scorer.

The code adds a learned embedding for the three question types, then runs a configurable transformer head before marker scoring. Published checkpoints use two head layers.

The English checkpoint pairs a ModernBERT-large backbone with a decision head and reports 421 million parameters. The multilingual model card reports a 322 million parameter mmBERT-base checkpoint. These encoders can use context on both sides of a token. [ModernBERT was designed as a modern bidirectional encoder](https://arxiv.org/abs/2412.13663), but Laya's deployed context budgets are checkpoint settings.

## Three outputs, one scoring mechanism

The three primitives differ in how the runtime interprets a probability distribution.

<div class="primitive-grid">
  <div><small>CHOICE</small><strong>Select one declared option</strong><p>Returns the top key, all option probabilities, and a confidence statistic.</p></div>
  <div><small>SCORE</small><strong>Estimate an ordinal level</strong><p>Returns the expected level, the distribution across levels, and confidence.</p></div>
  <div><small>NOUL</small><strong>Estimate truth probability</strong><p>Returns the probability assigned to true for a binary statement.</p></div>
</div>

Choice can route a ticket among declared queues. Score can place urgency on an ordered rubric. Noul, a TypeSafe term, treats the question as false or true and returns the probability of true. The [inference runtime](https://github.com/NandhaKishorM/laya/blob/d113dca2512fb3eaca313534bc54c7162d87c1d4/laya/agent.py) applies stored temperatures before softmax and formats the requested result.

Structured output removes a common failure at the boundary between model and code. The result already has known keys and numeric values, so the application does not need to recover JSON from generated prose. This is a schema guarantee. A phishing detector can still assign the wrong allowed label. A router can still send a case to the wrong declared queue. Teams should describe this as freedom from parse errors and undeclared outputs, not freedom from factual or decision errors.

## Reinforcement Learning for Calibrated Decisions [RLCD]

Reinforcement Learning for Calibrated Decisions, or RLCD, trains a model to improve the probability distribution it returns for a bounded decision, not only whether the top label is correct. A workflow can use those probabilities to set thresholds and decide when to act or fall back, but the objective does not guarantee calibration on new traffic. Laya's published objective also retains supervised cross-entropy, so its training is a hybrid rather than a pure reinforcement-learning run.

### What RLCD is optimizing

Laya perturbs a set of logits, converts each perturbed version into a distribution, scores those candidate distributions, and uses their relative rewards in a policy-gradient update. Its published notebook combines this signal with a full-weight soft cross-entropy loss but does not isolate the contribution of each term. [The training notebook exposes that procedure](https://github.com/NandhaKishorM/laya/blob/d113dca2512fb3eaca313534bc54c7162d87c1d4/notebooks/laya_finetune_typed_decisions_2xT4_kaggle.ipynb).

The reward combines a clipped log score with a spherical score. Ordinal questions also receive a ranked probability penalty. [The model card summarizes these scoring rules](https://huggingface.co/convaiinnovations/laya#training). In theory, a proper scoring rule gives the highest expected reward for reporting an honest distribution. [Gneiting and Raftery explain that incentive](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf). The implemented objective still faces clipping, finite data, optimization error, and distribution shift.

<figure class="system-figure split-figure">
  <div class="figure-heading"><span>Figure 2</span><b>Training learns distributions; inference applies them</b></div>
  <div class="train-infer" role="img" aria-label="Separate training and inference paths for Laya">
    <section>
      <small>TRAINING PATH</small>
      <div>Target distribution</div><i>↓</i><div>Logit perturbations</div><i>↓</i><div class="accent">Scoring-rule rewards</div><i>↓</i><div>RL update plus supervised loss</div><i>↓</i><div>Fit temperatures separately</div>
    </section>
    <section>
      <small>INFERENCE PATH</small>
      <div>State plus typed question</div><i>↓</i><div>Encoder and decision head</div><i>↓</i><div class="accent">Temperature-scaled softmax</div><i>↓</i><div>Typed probabilities</div>
    </section>
  </div>
  <figcaption>No reinforcement-learning loop runs during a normal prediction. Calibration data and training happen before deployment. Inference is a forward pass followed by deterministic result formatting.</figcaption>
</figure>

Temperature scaling is a separate repair step. It divides logits by a fitted scalar before softmax. The method can improve the match between confidence and observed accuracy without changing the highest-scoring class. [The standard temperature-scaling study explains that property](https://arxiv.org/abs/1706.04599). Laya's published notebook fits temperatures on a training subsample. A pilot should reserve separate calibration and test slices, then monitor calibration after data changes.

## Confidence is not correctness

Laya's choice and score confidence is not the top probability. The [source computes one minus normalized Shannon entropy](https://github.com/NandhaKishorM/laya/blob/d113dca2512fb3eaca313534bc54c7162d87c1d4/laya/common.py). A concentrated distribution gets a high value. A flat distribution gets a low value. For a binary distribution of 0.8 and 0.2, this confidence is about 0.278 even though the top probability is 0.8. Noul uses the larger binary probability.

This statistic describes the shape of one prediction. Calibration is a property measured across many predictions. A system is well calibrated at 0.8 when roughly 80 percent of comparable predictions are correct. Even then, no individual 0.8 prediction comes with a correctness guarantee. [TypeSafe's confidence documentation also treats confidence as a distribution-derived signal](https://docs.typesafe.ai/confidence), though its public material does not establish that Jev uses Laya's formula.

The practical pattern is selective automation. Choose a threshold against held-out business data. Above the threshold, allow a limited action that can be audited or reversed. Below it, send the case to a larger model, deterministic rules, or a person. Measure coverage and error together. A threshold that produces 95 percent accuracy on only 20 percent of cases may still be valuable, but it is a different product from 95 percent accuracy across all traffic.

## What the published benchmarks do and do not show

Laya's repository reports the following results. They are author-reported measurements, and this article did not run the model or reproduce them.

<table class="evidence-table">
  <caption>Selected author-reported Laya results</caption>
  <thead><tr><th scope="col">Test</th><th scope="col">Reported result</th><th scope="col">Boundary</th></tr></thead>
  <tbody>
    <tr><td>T4 latency</td><td><strong>32.8 ms</strong></td><td>One question, multilingual checkpoint</td></tr>
    <tr><td>Typed decisions</td><td><strong>0.766 accuracy</strong></td><td>Specialized checkpoint trained on the benchmark train split</td></tr>
    <tr><td>Held-out moderation</td><td><strong>0.530 accuracy</strong></td><td>Balanced ToxicChat split, macro F1 reported as 0.400</td></tr>
  </tbody>
</table>

The [benchmark report](https://github.com/NandhaKishorM/laya/blob/main/BENCHMARKS.md) records weaknesses beside headline numbers. Base checkpoints score about 0.34 to 0.36 on typed decisions, below the reported 0.461 majority baseline. Banking77 accuracy falls to 0.425 when 77 answer descriptions share a fixed option-token budget.

The report lists expected calibration error moving from 0.466 to 0.081 for the English checkpoint after temperature fitting. That is evidence that recalibration matters, not evidence that the shipped probability for any new domain is trustworthy. It is also a separate aggregate result from the specialized typed-decisions accuracy experiment.

Published Laya and Jev numbers should not be treated as a controlled race. Laya's report says its Jev figures came from other published measurements and used different prompts and sample sizes. [TypeSafe describes workflows written by its capabilities team and reference probabilities from larger models](https://typesafe.ai/blog/introducing-system-one-models-and-jev). These results help form hypotheses. An architecture decision needs one harness, the same questions, the same data, comparable warm and cold latency, and a cost model that includes self-hosted hardware.

## Where a decision model fits

The best candidates are frequent, bounded judgments with a stable schema and a measurable fallback. These scenarios are proposals to test, not validated deployments.

### Multilingual support routing

Input a ticket, select the language checkpoint explicitly, and ask one choice question over a small queue list. Send uncertain cases to triage. Measure per-language queue accuracy and fallback coverage.

### Retrieval and model routing

Ask whether a passage supports a query, or whether a request needs a larger generative model. Use the probability to gate expensive work. Measure missed evidence, downstream quality, and compute saved.

### Agent trace review

Score traces for policy review and route suspicious runs to an investigator. Keep permissions in deterministic code. Measure false negatives first, because a confident miss can hide a bad action.

### Document exception handling

Classify invoices or forms into declared exception paths. Let a generative model explain hard cases and let people approve consequential changes. Measure field-specific errors, abstention coverage, and review time.

<div class="workflow-line" role="img" aria-label="A proposed workflow sends low confidence decisions to a fallback and bounded high confidence decisions to policy checks">
  <div><small>01</small><strong>State arrives</strong><span>Request, event, or trace</span></div><i>→</i>
  <div class="accent"><small>02</small><strong>Laya scores</strong><span>Typed distributions</span></div><i>→</i>
  <div><small>03</small><strong>Policy checks</strong><span>Thresholds and permissions</span></div><i>→</i>
  <div><small>04</small><strong>Act or fall back</strong><span>Rules, model, or person</span></div>
</div>

The architecture is less suitable when the answer space is large, the task needs a novel explanation, the input exceeds the checkpoint budget, or evidence must be gathered through several reasoning steps. Laya's own results suggest treating multilingual routing, high-cardinality choice, and calibration as engineering work rather than model defaults.

- Start with one decision that already has labels, measurable downstream costs, and human review.
- Compare Laya with a simple supervised classifier and the current generative path under the same evaluation.
- Keep a shadow period before Laya influences live routes or actions.
- Record the full distribution, selected answer, route, latency, and eventual outcome for every decision.
- Fit calibration on a held-out slice and select the operating threshold from business costs.
- Rerun the evaluation when traffic changes.
- Optimize forward-pass speed only after decision quality and the fallback policy meet the workflow's requirements.

<section class="recommendation-box" aria-labelledby="latentsig-recommendations">
  <h3 id="latentsig-recommendations">Latentsig recommendations</h3>
  <ul>
    <li>Choose a narrow decision with reliable labels and a fallback that people can review.</li>
    <li>Use one evaluation harness for Laya, the supervised baseline, and the generative path.</li>
    <li>Set thresholds from the cost of errors and review, not from confidence alone.</li>
    <li>Monitor outcome quality and calibration after deployment, then reevaluate when traffic changes.</li>
  </ul>
</section>

## Sources

- [Laya project and runtime](https://github.com/NandhaKishorM/laya)
- [Laya model card](https://huggingface.co/convaiinnovations/laya)
- [Laya engineering article](https://laya.convaiinnovations.com/)
- [Laya benchmark report](https://github.com/NandhaKishorM/laya/blob/main/BENCHMARKS.md)
- [Pinned sequence and decision-head code](https://github.com/NandhaKishorM/laya/blob/d113dca2512fb3eaca313534bc54c7162d87c1d4/laya/common.py)
- [Pinned inference runtime](https://github.com/NandhaKishorM/laya/blob/d113dca2512fb3eaca313534bc54c7162d87c1d4/laya/agent.py)
- [TypeSafe introduction to System One models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [TypeSafe product documentation](https://docs.typesafe.ai/introduction)
- [ModernBERT](https://arxiv.org/abs/2412.13663)
- [On calibration of modern neural networks](https://arxiv.org/abs/1706.04599)
- [Thinking, fast and slow in Kahneman's Nobel lecture](https://www.nobelprize.org/uploads/2018/06/kahnemann-lecture.pdf)
- [Strictly proper scoring rules](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf)
