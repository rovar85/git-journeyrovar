---
track: aiinfra
title: GPUs, memory and the systems foundation
short: GPU foundations
sub: Why LLM inference lives on GPUs, what VRAM and memory bandwidth mean, how to read nvidia-smi, and how to calculate whether a model fits.
---

:::goals
- explain why inference workloads favour GPUs and what VRAM, memory bandwidth, CUDA cores and Tensor Cores are
- read `nvidia-smi` output and know the commands to inspect a GPU machine
- calculate the memory a model needs at different numeric precisions, for inference and for training
- describe the links between GPUs: inside a node and between nodes
:::

:::note What can and cannot run here
This lab has **no GPU**, so nothing in this track measures real GPU speed. The calculators are **real Python** and the arithmetic is exact, but hardware numbers (bandwidths, FLOPS) are **approximate public specifications from my own knowledge**: check the vendor datasheet for the GPU you use. Commands that need a GPU are shown as **Example output (not run here)**. The roadmap this track follows came from your screenshots; the last lesson maps its stages to these lessons.
:::

## 1. Why GPUs

A language model spends almost all its time on **matrix multiplication**: multiplying huge grids of numbers (the weights) by vectors or other grids (the activations). That work is **massively parallel**: millions of independent multiply-and-add operations.

| | CPU | GPU |
|---|---|---|
| Cores | tens of **powerful** cores, good at branching, varied logic | thousands of **simple** cores, good at doing the same operation on lots of data |
| Memory | large system RAM, moderate bandwidth (tens to a few hundred GB/s) | smaller, **very high bandwidth** memory on the card (HBM: roughly 1 to 5 TB/s on data-centre cards) |
| Best at | operating systems, databases, request handling | matrix maths: graphics, training and running neural networks |

Four terms you will meet constantly:

- **VRAM** (video RAM, on data-centre cards usually **HBM**, high-bandwidth memory): the GPU's own memory. The model's weights and the KV cache must fit here (or be spread across several GPUs).
- **Memory bandwidth**: how fast data moves between VRAM and the compute units, in GB/s or TB/s. For LLM **decoding** this is usually the limit (lesson 3).
- **CUDA cores**: the general-purpose parallel arithmetic units of an NVIDIA GPU. (CUDA is NVIDIA's programming platform.)
- **Tensor Cores**: specialised units that do small **matrix multiply-accumulate** blocks in one step, in low precisions (FP16, BF16, FP8 and lower). Most LLM maths runs here.

## 2. Looking at a GPU machine

On a machine with NVIDIA GPUs and drivers, the first tool is **`nvidia-smi`** (NVIDIA System Management Interface). Here is what you would see (Example output, not run here, values illustrative):

```term
$ nvidia-smi
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 560.35   Driver Version: 560.35   CUDA Version: 12.6              |
|-------------------------------+----------------------+----------------------|
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|===============================+======================+======================|
|   0  NVIDIA H100 80GB HBM3 On | 00000000:3B:00.0 Off |                    0 |
| N/A   41C    P0   312W / 700W |  71234MiB / 81559MiB |     93%      Default |
+-------------------------------+----------------------+----------------------+
| Processes:                                                                   |
|  GPU   PID   Type   Process name                                  GPU Memory |
|    0  18211     C   python (vllm serve ...)                         71220MiB |
+-----------------------------------------------------------------------------+
```

How to read it for inference work:

| Field | Meaning | What to look for |
|---|---|---|
| **Memory-Usage** | VRAM used / total | close to full is normal for a serving engine that **pre-allocates** memory for the KV cache; an out-of-memory error is not |
| **GPU-Util** | fraction of time **some** kernel was running | high does not mean efficient: a GPU waiting on memory still shows busy |
| **Pwr:Usage/Cap** | power draw | a GPU drawing far below its cap while "busy" is often memory-bound or starved |
| **Temp / Perf** | temperature and performance state | throttling shows up as a lower clock |
| **Processes** | which program holds the memory | a forgotten process holding 70 GB explains "why is my GPU full" |

The commands to be comfortable with (the Linux track covers the shell skills these rely on):

```term
$ nvidia-smi -l 1                       # refresh every second
$ nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv
$ nvidia-smi topo -m                    # how GPUs and network cards are connected (NVLink, PCIe, NUMA)
$ nvidia-smi dmon                       # rolling per-second utilisation, power, clocks
$ lspci | grep -i nvidia                # does the OS see the card at all?
```

You can check what **this** lab has:

```run
if command -v nvidia-smi > /dev/null; then nvidia-smi -L; else echo "nvidia-smi not found: this lab machine has no NVIDIA GPU or driver"; fi
echo "CPU cores: $(nproc)"
free -g | awk 'NR==2 {print "system RAM (GB): " $2}'
```

A cloud GPU server is Linux with extra drivers: everything from the Linux and Linux-networking tracks applies. The new parts are the **GPU driver**, the **CUDA toolkit**, a **container runtime that can pass GPUs into containers** (the NVIDIA Container Toolkit) and, in Kubernetes, a **device plugin** that advertises GPUs as a schedulable resource (`nvidia.com/gpu`).

## 3. Will the model fit? Memory arithmetic

The **weights** take `parameters x bytes per parameter`. The bytes depend on the numeric **precision**:

| Precision | Bytes per parameter |
|---|---|
| FP32 | 4 |
| FP16 / BF16 | 2 |
| FP8 / INT8 | 1 |
| INT4 (quantized) | 0.5 |

```run
mkdir -p ~/lab/aiinfra && cd ~/lab/aiinfra
cat > fit.py <<'EOF'
GB = 1e9
models = {"8B model": 8e9, "70B model": 70e9}
precisions = {"FP32": 4, "BF16": 2, "FP8": 1, "INT4": 0.5}
gpus = {"24 GB card": 24, "80 GB card": 80}

print(f"{'':10}" + "".join(f"{p:>10}" for p in precisions) + "   (weights only, GB)")
for name, params in models.items():
    print(f"{name:10}" + "".join(f"{params * b / GB:10.0f}" for b in precisions.values()))

print("\nDoes it fit with 20% reserved for KV cache, activations and overhead?")
for name, params in models.items():
    for prec, b in precisions.items():
        need = params * b / GB / 0.8
        fits = [g for g, size in gpus.items() if need <= size]
        n80 = -(-need // 80)             # ceil: how many 80 GB GPUs
        print(f"  {name:9} {prec:5} needs ~{need:6.0f} GB -> fits on: {', '.join(fits) or 'none'}; 80 GB GPUs needed: {int(n80)}")
EOF
python3 fit.py
```

Two lessons from the table:

1. A **70B model in BF16** (140 GB of weights) does **not** fit on one 80 GB GPU: you need **multiple GPUs** (parallelism, lesson 5) or **quantization** to 8 or 4 bits (a trade: smaller and faster, some accuracy loss).
2. The 20% reserve is a **rule of thumb**. The real extra is mostly the **KV cache**, which grows with context length and the number of concurrent requests (lesson 2).

### Training needs far more than inference

Mixed-precision training with the Adam optimiser stores, per parameter, roughly: BF16 weights (2 bytes), BF16 gradients (2), an FP32 master copy of the weights (4), and two FP32 optimiser states (8). That is about **16 bytes per parameter**, before activations:

```run
cd ~/lab/aiinfra
python3 - <<'EOF'
params = 8e9
infer = params * 2
train = params * 16
print(f"8B model, weights for inference in BF16: {infer / 1e9:6.0f} GB")
print(f"8B model, training state (~16 bytes/param): {train / 1e9:6.0f} GB  ({train / infer:.0f}x the inference weights)")
EOF
```

That is why fine-tuning large models uses tricks (LoRA trains a tiny extra set of weights, so gradients and optimiser state are small) and why training clusters shard that state across many GPUs.

## 4. How GPUs talk: inside a node and between nodes

One server ("node") typically holds **8 GPUs**. When a model does not fit on one GPU, data must move between them, so the **links** set the limit:

| Link | Scope | Rough bandwidth (approximate) |
|---|---|---|
| **HBM** (GPU's own memory) | on one GPU | several TB/s |
| **NVLink / NVSwitch** | between GPUs **in one node** | hundreds of GB/s per GPU |
| **PCIe** | GPU to CPU, or GPU to network card | tens of GB/s (PCIe 5.0 x16 is about 64 GB/s each way) |
| **InfiniBand or RoCE Ethernet** | **between nodes** | a 400 Gb/s port is 50 GB/s |
| **Storage** (NVMe, network file systems, object store) | loading weights, datasets, checkpoints | from a few GB/s per NVMe drive to a lot less over a busy network |

Every step down is roughly **10x slower** than the one before. Good system design keeps the **chatty** traffic (tensor parallelism) on the fastest links and puts only **light** traffic on the slow ones. This is the networking track (bandwidth, latency, oversubscription) applied to GPUs, which is why that knowledge transfers directly. **Storage** matters too: loading a 140 GB model from a slow disk takes minutes, which becomes the **cold start** problem of lesson 6.

:::warn Common mistakes
- **Counting only the weights.** The KV cache, activations and framework overhead can take 20% to well over half of the memory.
- **Reading GPU-Util as efficiency.** 100% utilisation can be a GPU stalled on memory. Look at power draw and throughput too.
- **Assuming a bigger GPU count is faster.** Splitting a model adds communication; past a point it slows each request.
- **Ignoring the host.** Slow storage, too little CPU or a busy PCIe bus starve a fast GPU.
- **Quoting spec-sheet peaks as achievable.** Real workloads reach a fraction of peak FLOPS and bandwidth.
:::

:::recap
- LLM inference is dominated by matrix multiplication, which suits GPUs: many simple cores, very high memory bandwidth, Tensor Cores for low-precision matrix maths.
- `nvidia-smi` shows memory, utilisation, power and processes; `nvidia-smi topo -m` shows how GPUs are linked.
- Weights need `parameters x bytes`; the KV cache and overhead come on top; training needs about 16 bytes per parameter.
- Links differ by orders of magnitude: HBM, NVLink, PCIe, the network, storage. Design so heavy traffic stays on fast links.
:::

:::try Your turn
Add a `Llama-sized 405B` entry (405e9 parameters) to `fit.py`. How many 80 GB GPUs does it need in BF16 and in FP8? Then compute how long it takes to read its BF16 weights from a disk at 2 GB/s.
:::

:::quiz
? Why is a model that needs 140 GB of weights hard to serve on one 80 GB GPU?
+ The weights alone exceed the GPU's memory, so it needs several GPUs or quantization
- GPUs cannot run Python
- CUDA forbids it
- The CPU is too slow
! Memory capacity is the first constraint.
? What does a high GPU-Util percentage tell you?
+ A kernel was running most of the time, not that the work was efficient
- The model is accurate
- The memory is empty
- The network is fast
! A memory-bound GPU can look fully busy.
? Which link should carry the most frequent GPU-to-GPU traffic?
+ NVLink inside a node, because it is far faster than the network between nodes
- The slowest network link
- Storage
- PCIe to the CPU
! Place chatty communication on the fastest links.
:::
