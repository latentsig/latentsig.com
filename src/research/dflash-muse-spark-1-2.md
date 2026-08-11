---
title: "DFlash explained: how block-diffusion drafting makes LLMs generate faster"
subtitle: "A visual introduction to DFlash’s architecture, why it maps well to Apple Silicon and NVIDIA GPUs, and what a Muse Spark integration would actually require."
author: "Latentsig AI Research"
date: "August 2026"
reading_time: "13 min"
status: "Systems explainer · paper walkthrough"
---

# DFlash explained: how block-diffusion drafting makes LLMs generate faster

Large language models generate text one token at a time. Before a model can produce token 101, it has to finish token 100. This is called **autoregressive generation**. It works well, but it makes the hardware wait through a long series of small, dependent steps.

**DFlash** changes the size of each step. It pairs the full language model with a small block-diffusion model. The small model proposes several future tokens at once. The full model checks them together and keeps only the tokens it agrees with. The original model still decides what gets emitted, but it can move forward by several tokens in one cycle.

Jian Chen, Yesheng Liang, and Zhijian Liu report up to **6.1× lossless decoding acceleration** on Qwen3-8B. On many math and code tasks, the target accepted roughly six to eight tokens per cycle. Most of the paper's experiments used NVIDIA H200 or B200 data-center GPUs. Those numbers should not be treated as benchmarks for consumer RTX cards or Apple Silicon.

<aside class="truth-note">
  <strong>In plain English</strong>
  <p>A small diffusion model fills a masked token block in one pass. It uses hidden features from the full model as a hint. The full model then checks the proposed tokens before any of them are shown.</p>
</aside>

## Start with ordinary speculative decoding

Suppose the target model is generating the phrase “speculative decoding is faster.” An ordinary autoregressive pass might create one token per expensive target-model call:

<figure class="concept-figure serial-vs-block">
  <div class="figure-heading"><span>Figure 1</span><b>One-token decoding versus block speculation</b></div>
  <div class="decode-compare" role="img" aria-label="Autoregressive generation needs one target pass per token, while DFlash drafts several tokens in parallel and verifies them together">
    <div class="compare-label"><small>BASELINE</small><strong>One token per target pass</strong></div>
    <div class="pass-row serial-row">
      <span><i>pass 1</i>speculative</span><b>→</b><span><i>pass 2</i>decoding</span><b>→</b><span><i>pass 3</i>is</span><b>→</b><span><i>pass 4</i>faster</span>
    </div>
    <div class="compare-label"><small>DFLASH</small><strong>One draft pass + one target verification</strong></div>
    <div class="block-row">
      <div class="masked-block"><i>parallel draft</i><span>speculative</span><span>decoding</span><span>is</span><span>faster</span></div>
      <b>→</b>
      <div class="verify-block"><i>target verifies together</i><span>✓</span><span>✓</span><span>✓</span><span>✓</span></div>
    </div>
  </div>
  <figcaption>Conceptual example. Real token boundaries and accepted lengths depend on the tokenizer, prompt, sampling settings, and draft quality.</figcaption>
</figure>

Traditional speculative decoding also proposes several tokens, but its draft model usually writes them one by one. An eight-token proposal still takes eight small draft steps before verification. DFlash predicts the whole block in one step.

The speed gain depends on a simple ratio:

<div class="equation-card"><span>average latency per accepted token</span><strong>L = (T<sub>draft</sub> + T<sub>verify</sub>) / τ</strong><p><b>τ</b> is the average number of tokens accepted per cycle. DFlash tries to reduce draft time while increasing τ.</p></div>

An autoregressive drafter pays roughly `block size × one draft step`. A diffusion drafter pays for one parallel block pass. When the target accepts enough of the proposal, the cost of drafting and verification is spread across several output tokens.

## What “diffusion” means for text

DFlash does not turn words into an image-like diffusion process. It uses **discrete block diffusion**. The block starts with a known anchor token followed by mask tokens, and the drafter predicts every masked position together.

Inside a draft block, attention is bidirectional. Every masked position can use the other positions in that block while it forms its prediction. Across blocks, training uses an attention mask to prevent future information from leaking backward. At inference time, the drafter fills the next masked block in a single forward pass.

Small diffusion language models are fast, but they are less capable than the large autoregressive target. DFlash splits the work accordingly:

- the **diffusion drafter** provides cheap parallel proposals;
- the **autoregressive target** provides quality control and the final probability distribution.

This keeps the acceleration lossless in the speculative-decoding sense. A bad proposal wastes time, but it never becomes output.

## The DFlash architecture, layer by layer

DFlash needs the drafter to be fast and accurate. A cheap proposal is useless if the target rejects it after one token.

<figure class="paper-figure">
  <div class="figure-heading"><span>Paper Figure 2</span><b>DFlash inference architecture</b></div>
  <div class="paper-canvas"><img src="/images/research/dflash/paper/dflash-inference-architecture.png" alt="DFlash paper diagram showing target context features injected into the key-value cache of each diffusion draft layer" loading="lazy" /></div>
  <figcaption>Source: Chen, Liang, and Liu, <a href="https://arxiv.org/abs/2602.06036">DFlash: Block Diffusion for Flash Speculative Decoding</a>, Figure 2, licensed CC BY 4.0.</figcaption>
</figure>

The inference cycle has five stages.

### 1. The target performs prefill

The full model reads the prompt, builds its KV cache, and generates the first target token. This is standard prefill. DFlash primarily accelerates the repeated **decode** phase after prefill; it does not make a long prompt disappear.

### 2. Five target layers become a context feature

The reference configuration samples hidden states from five target-model layers, from early layers through late ones. These states carry information about syntax, meaning, task state, and likely future tokens. DFlash joins them, applies a learned projection, and normalizes the result:

<div class="feature-fusion" role="img" aria-label="Hidden states from five target layers are concatenated, projected, normalized, and reused as target context">
  <div class="layer-stack"><span>L2</span><span>L8</span><span>L14</span><span>L20</span><span>L−3</span></div>
  <b>→</b><div class="fusion-node"><small>CONCAT + W<sub>c</sub></small><strong>RMSNorm</strong></div><b>→</b><div class="context-node"><small>PERSISTENT</small><strong>Target context H<sub>t</sub></strong></div>
</div>

The precise layer indices are checkpoint-specific and frozen in the trained drafter configuration. Five is the paper’s default, not a universal rule.

### 3. Target context is injected into every draft layer

The fused target feature is not added once at the input and left to fade through the network. DFlash projects it into **keys and values at every draft transformer layer** and stores it in the draft KV cache.

The masked draft tokens provide the queries. Each query can attend to the stored target context and the other positions in the draft block. The target signal is available in every layer, so deeper draft models can still use it directly. In the paper's main ablation, five draft layers gave the best balance of speed and acceptance. Eight layers increased the accepted length, but the extra draft work cancelled part of the gain.

<div class="kv-diagram" role="img" aria-label="Each of five DFlash layers receives the same target context as injected keys and values while masked draft tokens provide queries">
  <div class="kv-source"><small>FUSED TARGET CONTEXT</small><strong>Shared K + V</strong><span>computed once, cached</span></div>
  <div class="kv-bus"><i></i><i></i><i></i><i></i><i></i></div>
  <div class="draft-layers"><span>Draft layer 1 <b>Q ↔ K,V</b></span><span>Draft layer 2 <b>Q ↔ K,V</b></span><span>Draft layer 3 <b>Q ↔ K,V</b></span><span>Draft layer 4 <b>Q ↔ K,V</b></span><span>Draft layer 5 <b>Q ↔ K,V</b></span></div>
</div>

The projection is small next to the target model. In the paper's Qwen3.5-35B-A3B example, it adds about 42 MB of weights to a roughly 70 GB BF16 target. The draft transformer adds more memory, but it is still much smaller than the target.

### 4. The drafter fills a token block in parallel

The default Qwen setup uses five draft layers and a block size of 16. All 16 candidate positions run together. This gives the GPU a wider matrix operation instead of a chain of small operations, so draft time grows slowly as the block gets larger.

<figure class="paper-figure compact-paper">
  <div class="figure-heading"><span>Paper Figure 3</span><b>Draft latency scales differently</b></div>
  <div class="paper-canvas"><img src="/images/research/dflash/paper/dflash-draft-cost.png" alt="Bar chart from the DFlash paper comparing EAGLE-3 draft latency with one, three, and five-layer DFlash across block sizes" loading="lazy" /></div>
  <figcaption>The paper’s measured draft-cost comparison. EAGLE-3 latency rises steeply with more draft tokens; DFlash remains comparatively flat. Source: Chen et al., Figure 3, CC BY 4.0.</figcaption>
</figure>

### 5. The target verifies and commits a prefix

The target scores the proposed block in one causal verification pass. It checks tokens from left to right, keeps the longest valid prefix, and discards everything after the first rejection. The target also produces a new token that becomes the anchor for the next cycle.

<div class="acceptance-demo" role="img" aria-label="Eight drafted tokens are checked left to right; five are accepted, the sixth is rejected, and later candidates are discarded">
  <small>ONE SPECULATIVE CYCLE</small>
  <div><span class="accepted">the <i>✓</i></span><span class="accepted">model <i>✓</i></span><span class="accepted">can <i>✓</i></span><span class="accepted">draft <i>✓</i></span><span class="accepted">tokens <i>✓</i></span><span class="rejected">quick <i>×</i></span><span class="discarded">in</span><span class="discarded">parallel</span></div>
  <p>Accepted prefix τ = 5. Everything after the first mismatch is discarded, then decoding continues from the target’s correction.</p>
</div>

## How the drafter is trained

The target model stays frozen during DFlash training. Only the draft transformer layers are updated. The drafter shares the target's frozen token embedding and language-model head, which keeps both models in the same representation space.

<figure class="paper-figure">
  <div class="figure-heading"><span>Paper Figure 4</span><b>Random masked blocks during training</b></div>
  <div class="paper-canvas"><img src="/images/research/dflash/paper/dflash-training-attention.png" alt="DFlash training attention diagram with target context features, randomly sampled clean anchor tokens, masked positions, and invisible positions" loading="lazy" /></div>
  <figcaption>Clean target tokens become random anchors; subsequent positions are masked for parallel prediction. The block-sparse attention mask prevents leakage. Source: Chen et al., Figure 4, CC BY 4.0.</figcaption>
</figure>

Three parts of the training recipe help the target accept longer prefixes:

1. **Target-generated responses.** Training examples use outputs from the exact target model, so the drafter learns that model’s continuation distribution rather than a generic corpus distribution.
2. **Random anchor blocks.** Each clean response contributes randomly placed anchor tokens followed by masked positions. This matches inference, where every cycle starts from a verified target token, and makes long-context training more efficient.
3. **Front-loaded loss.** An error early in a speculative block invalidates every later token. DFlash therefore weights earlier positions more heavily with an exponentially decaying loss.

The drafter belongs to a specific target model. A change in tokenizer, hidden-state geometry, checkpoint, or quantization can push acceptance down sharply. A Qwen DFlash checkpoint cannot be attached to an unrelated model and expected to work.

## Why this is faster on Apple M-series chips

Autoregressive local inference on Apple Silicon is often **memory-bandwidth bound**. For each generated token, the GPU streams a large fraction of the model weights from unified memory, performs comparatively little work, and repeats. A powerful chip can still spend much of its time moving weights rather than filling its arithmetic units.

DFlash changes the arithmetic intensity of the decode loop:

- the small drafter evaluates a block of masked positions together;
- target verification evaluates several proposed positions in one pass;
- multiple accepted tokens amortize target-weight reads and launch overhead;
- the wide block operations map better to the Metal GPU than a chain of tiny one-token passes.

MLX can keep the target weights, drafter, KV caches, and injected features in Apple's unified memory pool. Community measurements on an M5 Max range from **1.34× to 4.37×** across several Qwen3.5 sizes and context lengths. Smaller models and shorter contexts performed best. The gain fell as the context grew and as quantization changed the balance between drafting and verification.

<div class="hardware-paths">
  <div><small>APPLE SILICON · MLX</small><strong>Amortize unified-memory traffic</strong><p>Best when the complete target and drafter fit without swapping, acceptance stays high, and block verification remains cheaper than repeated one-token weight streaming.</p><b>Watch: memory pressure · context length · thermal stability</b></div>
  <div><small>NVIDIA RTX · CUDA</small><strong>Turn serial decode into wider kernels</strong><p>Best when CUDA graphs, fused attention, and tensor-core-friendly precision keep drafting and verification on GPU with stable shapes.</p><b>Watch: VRAM · architecture support · quantized KV compatibility</b></div>
</div>

On a Mac, “fits in unified memory” is necessary but not sufficient. The extra drafter and KV state must leave headroom for the operating system and context cache. If macOS starts swapping, any nominal speculative speedup vanishes.

## Why this is faster on NVIDIA RTX GPUs

RTX GPUs are built for parallel tensor work, while one-token decoding gives them a narrow job. DFlash turns eight or sixteen serial draft steps into one block operation. The target can then verify the block with larger matrix-matrix kernels instead of a series of matrix-vector-style decode steps.

The runtime matters as much as the GPU. DFlash support is appearing in vLLM, SGLang, TensorRT-LLM, and `llama.cpp`. NVIDIA's published results use B200 and B300 data-center Blackwell hardware, not GeForce cards. RTX 50-series cards share the Blackwell generation and are the clearest consumer target for these CUDA paths. RTX 40-series and older cards need their own measurements.

In the paper's SGLang tests on one B200, speedups ranged from 2.3× to 5.1× depending on the model, task, and concurrency. The relative gain shrank at higher concurrency because ordinary batched serving already gave the GPU more parallel work. DFlash is therefore most interesting for local use and low-concurrency serving, where the GPU would otherwise spend more time on narrow decode operations.

On either platform, DFlash wins only when drafting and verification take less time than generating the accepted tokens one by one.

## How DFlash could work with Muse Spark

Muse Spark is worth examining because Meta positions the model family for reasoning, coding, tool use, multimodal input, and long-running agent work. A single session can produce thousands of tokens across plans, code, tool arguments, and final answers. Faster decoding would save time at each of those steps.

DFlash cannot sit in front of a hosted Muse API. Training and inference both need access to the target's weights, tokenizer, intermediate hidden states, embedding, and language-model head. Work can begin only if Meta releases compatible model artifacts and permits this form of deployment.

<figure class="concept-figure muse-path">
  <div class="figure-heading"><span>Figure 7</span><b>A Muse-specific DFlash path</b></div>
  <div class="muse-flow" role="img" aria-label="Muse outputs and hidden states train a target-specific DFlash adapter that is then deployed with Muse on MLX or CUDA">
    <div><small>01 · TARGET ACCESS</small><strong>Muse weights + tokenizer</strong><span>Intermediate layers, embedding, LM head</span></div><b>→</b>
    <div><small>02 · ALIGNMENT DATA</small><strong>Muse-generated traces</strong><span>Code, reasoning, tool calls, chat</span></div><b>→</b>
    <div class="accent"><small>03 · TRAIN</small><strong>Muse DFlash adapter</strong><span>Masked blocks + KV injection</span></div><b>→</b>
    <div><small>04 · DEPLOY</small><strong>MLX or CUDA runtime</strong><span>Draft → verify → adaptive fallback</span></div>
  </div>
  <figcaption>A Qwen or Llama DFlash checkpoint cannot accelerate Muse. The drafter must be trained and validated against the exact Muse target.</figcaption>
</figure>

A useful Muse training set would include the kinds of continuations DFlash tends to predict well:

- **agentic coding:** syntax, indentation, imports, repeated identifiers, and patch formats;
- **tool use:** JSON schemas, function arguments, and structured outputs;
- **long reasoning:** repeated mathematical and programmatic patterns, while preserving high-entropy steps;
- **conversation:** enough open-ended dialogue to test fallback behavior outside structured work.

Muse's multimodal inputs do not change the basic decode mechanism. Image, audio, and video encoding happen during input processing and prefill. DFlash would speed up the autoregressive text decoder after those features enter the target context. It would not speed up the vision encoder or the initial multimodal prefill.

For a Muse Spark 1.2 deployment, we would use **1.5× to 3.1×** as an initial ship target on capable M-series and RTX systems. This is a target, not a measured Muse benchmark. The result would depend on the model's size, dense or mixture-of-experts structure, hidden width, attention design, quantization, and draft acceptance on real Muse outputs.

## The benchmark that decides whether it works

To test this properly, the autoregressive and DFlash runs must use the same target weights, quantization, prompts, sampling settings, output lengths, context distribution, engine build, and concurrency.

Measure:

- verified decode tokens per second and end-to-end latency;
- time to first token, keeping prefill separate from decode;
- average accepted prefix `τ` and acceptance by block position;
- peak memory, KV-cache growth, and swapping or offload;
- greedy output equality and distributional correctness under sampling;
- results split by code, tool use, reasoning, chat, and long context.

<aside class="gate-note">
  <small>SHIP GATE</small>
  <strong>Median ≥ 1.5× · p95 latency improved · no output drift · no swapping</strong>
  <p>The runtime should shorten the block or fall back to ordinary decoding when recent acceptance drops below break-even.</p>
</aside>

DFlash will not be faster on every prompt. High sampling temperatures, unpredictable prose, a mismatched drafter, long-context KV pressure, or quantization-induced hidden-state drift can make speculation slower than ordinary decoding. A production runtime should turn it down or switch it off when acceptance falls.

## What this means

DFlash is a **target-conditioned, block-parallel prediction adapter**. It replaces the drafter's serial token loop with one diffusion pass and uses the target's hidden states to improve the proposal. The target still verifies every committed token.

The design fits both Apple Silicon and NVIDIA GPUs for different reasons. Apple chips can spread unified-memory traffic across several accepted tokens. RTX GPUs can replace narrow sequential work with wider CUDA operations. Muse Spark could use the same approach, but only after compatible weights and hidden states are available and a Muse-specific drafter has been trained.

---

## Sources

- Jian Chen, Yesheng Liang, and Zhijian Liu, [“DFlash: Block Diffusion for Flash Speculative Decoding”](https://arxiv.org/abs/2602.06036), ICML 2026. The reproduced paper diagrams are licensed under CC BY 4.0.
- Z-Lab, [DFlash reference implementation and supported checkpoints](https://github.com/z-lab/dflash), accessed August 2026.
- NVIDIA, [“Boost Inference Performance up to 15x on NVIDIA Blackwell Using DFlash Speculative Decoding”](https://developer.nvidia.com/blog/boost-inference-performance-up-to-15x-on-nvidia-blackwell-using-dflash-speculative-decoding/), 2026.
- `dflash-mlx`, [Apple Silicon implementation and M5 Max benchmarks](https://github.com/bstnxbt/dflash-mlx), accessed August 2026.
- Meta Superintelligence Labs, [“Introducing Muse Spark: Scaling Towards Personal Superintelligence”](https://ai.meta.com/blog/introducing-muse-spark-msl/), 2026.
- Meta Superintelligence Labs, [“Introducing Muse Spark 1.1”](https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/), 2026.
