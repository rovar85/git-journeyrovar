---
track: aideep
title: "Deep dive 19: managed AI platforms, Azure AI Foundry and AWS Bedrock"
short: Azure Foundry and Bedrock
sub: What the two big managed platforms give you (models, RAG, agents, guardrails, evaluation, tracing), how that maps to what you have built here, and how to avoid lock-in.
---

:::goals
- map the pieces of a managed AI platform onto the concepts in this course
- compare Azure AI Foundry and AWS Bedrock by the questions that matter, without memorising product names
- explain the build-versus-buy decision and the cost of lock-in
- write a provider-neutral gateway with fallback and a budget limit
:::

:::warn Product names change
Cloud AI products are renamed and reorganised often (Microsoft has been renaming parts of its Azure AI Foundry offering; AWS keeps adding agent features to Bedrock). This lesson teaches the **stable concepts** and names the **typical features**. Before you decide anything, check the vendor's current documentation and pricing page.
:::

## 1. Why managed platforms exist

You can build every part of an LLM application yourself: a serving stack ([AI infrastructure track](#aiinfra-1)), a vector store ([Deep dive 16](#aideep-16)), an agent loop ([Deep dive 7](#aideep-7)), guardrails and evaluation ([Deep dive 20](#aideep-20)), tracing. A managed platform sells you these as **services inside your cloud account**: one bill, your existing identity and network controls, and models from several providers behind one API. You trade control and some flexibility for time, compliance and operations.

## 2. The same building blocks on both platforms

| Concept in this course | What a managed platform usually calls it | Where you learn the concept |
| --- | --- | --- |
| Calling a model | a model catalog and one inference API for many model families | [Lectures 3](#lectures-3) |
| RAG | a managed knowledge base: it chunks, embeds, indexes and retrieves your documents from a storage bucket or search service | [Deep dive 6](#aideep-6), [Deep dive 16](#aideep-16) |
| Agents and tools | a managed agent service that runs the loop, calls your functions or APIs, and keeps session memory | [Deep dive 7](#aideep-7), [Deep dive 18](#aideep-18) |
| Guardrails | content filters, denied topics, PII masking and prompt-attack detection applied to inputs and outputs | [Deep dive 12](#aideep-12), [Deep dive 20](#aideep-20) |
| Evaluation | built-in evaluators and model-as-judge jobs over your test set | [Lectures 8](#lectures-8), [Deep dive 9](#aideep-9) |
| Tracing and monitoring | traces of every step, token and cost metrics, integrated with the cloud's monitoring service | [AI infrastructure 9](#aiinfra-9) |
| Fine-tuning | managed customisation of selected models on your data | [Lectures 4](#lectures-4) |
| Identity and network | cloud IAM, private endpoints, customer-managed keys | [Cloud track](#cloud-2), [Senior cloud 11](#cloudsenior-11) |

## 3. Azure AI Foundry versus AWS Bedrock: ask these questions

Instead of a feature checklist that goes out of date, compare on questions you can answer from current documentation:

1. **Which models are available in my region**, and are the ones I need offered at all? (Availability differs by region and by quota.)
2. **How is capacity bought**: pay per token, or reserved throughput? What are the default rate limits, and how long does a quota increase take?
3. **How does RAG fit**: which store holds the vectors (the platform's search service or your own database), and what does a re-index cost?
4. **Where does identity live**: Entra ID and Azure RBAC on Azure; IAM roles and policies on AWS. Can an agent act with a **narrow** role? (This is the least-privilege rule from [Deep dive 12](#aideep-12).)
5. **Where do the logs go**, and are prompts and responses stored? Check data-residency and retention terms for your compliance needs.
6. **How portable is it**: if you leave, what do you keep (documents, evaluation set, prompts) and what must you rebuild (the agent definition, the knowledge-base configuration)?
7. **What does a month cost** at your real traffic? Run the numbers with the [cost method in Deep dive 14](#aideep-14).

A short, practical rule: **use the platform that already holds your data, identity and network.** Moving data between clouds usually costs more than any model price difference.

## 4. Build versus buy

| If... | lean towards |
| --- | --- |
| you need something working this month, with compliance inherited from your cloud | the managed platform |
| you need an unusual retrieval method, a specific open model, or strict cost control at large scale | build on open parts (LangGraph, a vector database, a serving engine) |
| you are unsure yet | build the thin version in plain code, **behind a small interface**, and move parts to managed services as they prove themselves |

The last row leads to the one habit that protects you from lock-in: keep a **provider-neutral interface** in your own code.

## 5. A provider-neutral gateway with fallback and a budget

This runs real code with two **fake** providers (one is flaky). It shows the design: one interface, ordered fallback, retries, a log and a hard spending limit. Real adapters would call each vendor's SDK inside `complete`.

```run
mkdir -p ~/lab/ai && cd ~/lab/ai
cat > gateway.py <<'EOF'
import time, random
random.seed(3)

class ProviderError(Exception): pass

class Provider:
    """The one interface your app depends on. Each cloud or vendor gets an adapter behind it."""
    name = "base"
    def __init__(self, fail_rate=0.0, price_per_1k=0.0): self.fail_rate, self.price = fail_rate, price_per_1k
    def complete(self, prompt):
        if random.random() < self.fail_rate: raise ProviderError(f"{self.name}: 429 rate limited")
        return f"[{self.name}] answer to: {prompt[:30]}"

class CloudA(Provider): name = "cloud-a"
class CloudB(Provider): name = "cloud-b"

class Gateway:
    def __init__(self, providers, budget_usd):
        self.providers, self.budget, self.spent, self.log = providers, budget_usd, 0.0, []
    def ask(self, prompt, retries=1):
        tokens = max(1, len(prompt) // 4)
        for p in self.providers:                                   # fallback order = your routing policy
            for attempt in range(retries + 1):
                cost = tokens / 1000 * p.price
                if self.spent + cost > self.budget:
                    self.log.append(f"budget stop before {p.name}"); raise ProviderError("budget exceeded")
                try:
                    out = p.complete(prompt); self.spent += cost
                    self.log.append(f"ok  {p.name} attempt {attempt + 1} cost ${cost:.4f}")
                    return out
                except ProviderError as e:
                    self.log.append(f"err {e}")
        raise ProviderError("all providers failed")

gw = Gateway([CloudA(fail_rate=0.7, price_per_1k=0.50), CloudB(price_per_1k=0.80)], budget_usd=0.01)
for i in range(1, 5):
    try: print(i, gw.ask("Summarise the incident report number %d for the customer" % i))
    except ProviderError as e: print(i, "FAILED:", e)
print()
print("\n".join(gw.log))
print(f"spent ${gw.spent:.4f} of ${gw.budget}")
EOF
python3 gateway.py
```

Notice three things. The flaky first provider fails often and the gateway **falls back** to the second. The budget check stops the run **before** an over-budget call, not after. And the log explains every decision, which is what you will want during an outage. Put API keys in your cloud's secret store, never in this code ([Senior cloud 11](#cloudsenior-11)).

## Common misconceptions

- "A managed platform removes the need for evaluation." It removes servers, not the need to measure quality.
- "Guardrails make the app safe." They reduce risk; design the agent with least privilege anyway.
- "The cheapest model per token is the cheapest system." Retries, long prompts and bad retrieval cost more than the price difference.

## Practice (answers below)

1. Your company's data is in AWS and its identity is in Azure. Which questions in section 3 decide the platform?
2. Add a latency measurement to the gateway and choose the fastest provider after three calls.
3. List what you would export to leave a managed knowledge base.

:::recap
- Managed AI platforms bundle **models, knowledge bases (RAG), agents, guardrails, evaluation and tracing** behind your cloud's identity and billing.
- Compare platforms on **availability, capacity, identity, data handling, portability and real cost**, not on feature lists.
- Keep a **provider-neutral interface** (and your evaluation set) in your own repository to stay portable.
- Names change often: **check current documentation**.
:::

:::note Answers
1. Questions 4 to 6 (identity, where the logs go, portability) and the data location rule: prefer where the data is, but check whether cross-cloud identity is allowed for the agent. 2. Time each call with `time.perf_counter()`, store a rolling average per provider and sort the provider list by it. 3. The source documents, the chunking and embedding settings, the evaluation questions and expected answers, the prompts and the agent instructions and tool schemas.
:::

```quiz
? What is the strongest protection against vendor lock-in in an LLM application?
+ A provider-neutral interface in your code, plus keeping your documents, prompts and evaluation set yourself
- Choosing the biggest vendor
- Using only one model forever
- Avoiding the cloud
! Portability comes from owning the interface and the data and tests, so adapters can change.

? A managed knowledge base is closest to which part of this course?
+ A hosted RAG pipeline: chunking, embeddings, a vector index and retrieval
- Fine-tuning
- The attention mechanism
- A GPU scheduler
! It packages the ingest and retrieve steps of RAG as a service.

? Why check data-residency and retention terms before using a managed AI service?
+ Prompts and responses may contain regulated or personal data
- Because tokens are free
- Because models need a licence
- Because it changes the model quality
! Where data is stored and for how long can decide whether the service is allowed for your workload.
```
