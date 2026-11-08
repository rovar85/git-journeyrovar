---
track: aibank
title: "AI interview bank: Prompting and structured output (part 1 of 2)"
short: Prompting and structur 1
sub: 12 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## The three parts of a chat call and the prefill trick

*Level 1 (screening) · concept · about 6 minutes*

Walk me through the three parts of a chat API call and what each one is for. Then tell me how you would get a model to return a JSON object with no preamble, without a structured output API.

:::answer Show the answer
:::say Short answer
The system message sets identity, rules and output constraints and persists across turns. The user message carries the task and changes every turn. The assistant prefill starts the model's reply for it, so a prefill of an opening brace makes the model continue as JSON with no preamble, on the providers that accept a partial assistant turn.
:::

**Full answer**

**The three parts**

| Part | Role | Lifetime |
|---|---|---|
| System message | identity, behavioral rules, output rules; the model treats it as the highest-priority context | persists across turns |
| User message | the task or the question | changes every turn |
| Assistant prefill | the first characters of the reply, written by you | one turn |

Without a system message, the user message is under-constrained and the model fills the gaps with guesses.

**The prefill**

Send a final message with the assistant role and the content `{`. The model continues from there, so the reply is the rest of the object, and your code puts the brace back in front. No preamble, no code fence. Where the provider does not accept a partial assistant turn, use its structured output mode instead.

**Write the instruction, not the wish**

The lesson's rules for a clear instruction: name the format, the length, the audience, what to include and what to exclude, and give one example of the output. Three kinds of constraint work: negative ones that remove regions of the output space, positive ones that guarantee a structure in every reply, and conditional ones that handle edge cases.

**Do not over-constrain**

A system prompt of 2,000 words of rules leaves the model less room for the task. The lesson keeps most system prompts under 500 tokens, and checks them for contradictions, because when two rules conflict the model picks one at random.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why does the system message come first? Expected: the model gives it the highest priority, and it stays constant while user turns change.
- **Level 2:** What does the prefill save compared with an instruction to respond in JSON? Expected: the preamble and the code fence; the reply starts inside the object, so the parser sees JSON from the first character.
- **Level 2:** Your system prompt has grown to 2,000 words of rules. What does the lesson say? Expected: over-constraining; the model spends its capacity on the rules instead of the task, and most tasks want a system prompt under 500 tokens.
- **Level 3:** How do you write one prompt that behaves the same on several providers? Expected: plain English, an explicit format, XML style delimiters, the instructions at the start and the end, temperature zero while testing, and two or three examples.

**Wrong answers, and why they fail**

- "The system message is just the first user message." It is processed with a higher priority and persists while user turns change.
- "A prefill works on every provider." Only some accept a partial assistant turn; elsewhere use the structured output mode.
- "More rules in the system prompt means more control." Past a point the model spends its capacity on the rules; the lesson keeps most system prompts under 500 tokens.

:::

## What JSON mode guarantees and what it does not

*Level 1 (screening) · concept · about 6 minutes*

A teammate turned on the provider's JSON mode and says the extraction output is now guaranteed. What does JSON mode guarantee, what does it not, and what do you turn on instead?

:::answer Show the answer
:::say Short answer
JSON mode guarantees that a finished output parses, nothing more; a response cut at the token limit can still fail, so check the finish reason first. It does not guarantee your keys, your types, your enum values or the absence of extra fields. Turn on the schema mode, where the provider takes a JSON Schema and constrains decoding to it, and keep a check on your side for the values that a schema cannot judge.
:::

**Full answer**

**Four levels of control**

| Level | Guarantee | Typical failure |
|---|---|---|
| A prompt that says "respond in JSON" | none; about 90 percent valid | code fences, preamble text, truncation, wrong structure |
| JSON mode | valid syntax | extra keys, wrong types, missing fields |
| Schema mode | the output conforms to your schema | a wrong value with the right type, or a refusal |
| Constrained decoding | every token is valid for the schema | the same as schema mode; this is how schema mode is built |

The constrained decoding lesson is blunt about it: pure JSON mode guarantees valid JSON, not JSON that is valid for your use case, so always provide a full schema.

**What strict schema mode asks of you**

The structured output lesson lists the strict mode rules: every property appears in `required`, `additionalProperties` is false everywhere, and there is no unresolved reference. A schema that breaks these is rejected at request time with a 400.

**What stays with you**

Under strict enforcement two failures disappear for a response that finishes, the parse error and the schema violation. A response cut at the token limit can still fail to parse, so check the finish reason before you read it. Two more remain. The model can refuse when the input does not fit the schema, which your code treats as a typed outcome. And the model can fill a field with a value that has the right type and the wrong content; no format layer sees that.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Which failure remains under strict schema mode? Expected: a refusal, when the model decides the input does not fit the schema; handle it as a typed outcome, and route a response cut at the token limit to the error path.
- **Level 2:** What does strict mode demand of the schema? Expected: every property required, additional properties forbidden, no unresolved references; otherwise the request is rejected with a 400.
- **Level 2:** The output matches the schema and the price is wrong. Which layer failed? Expected: none of the format layers; the value is invented, and only a semantic check or an eval catches that.
- **Level 3:** A field is sometimes unknown in the source text. How do you write the schema? Expected: allow null or a sentinel; a grammar that forces a value makes the model invent one, such as a date.

**Wrong answers, and why they fail**

- "JSON mode means the keys match my model." It only guarantees syntax; extra keys, wrong types and missing fields still happen.
- "Adding 'respond in valid JSON' to the prompt is the same thing." A prompt-only approach is about 90 percent reliable and fails with fences, preambles and truncation.
- "With schema mode I can drop validation." A schema cannot catch a wrong value with the right type; keep a semantic check.

:::

## Cache reads stay at zero on every request

*Level 2 (working) · debug · about 8 minutes*

You enabled prompt caching on a 15,000-token system prompt. The usage field for cache reads stays at zero on every request, while cache creation tokens are charged every time. What do you look for, and in what order?

:::answer Show the answer
:::say Short answer
Something above the cache breakpoint changes on every request. Look first for a timestamp or a request id at the top of the system prompt, then for tool definitions serialized in a changing order, then for near-duplicate text that differs by a byte between code paths, and then for a block under the minimum cacheable size. The cache matches prefixes only, so the first differing token turns everything after it into a miss.
:::

**Full answer**

**The invariant**

All the providers cache prefixes. When a request's prefix matches a recent one, the provider serves the stored key and value cache instead of encoding the tokens again, and bills a read at a fraction of the input rate. If any token differs, everything after it is a miss. The usage fields tell the story: a creation count every time and a read count of zero means the prefix never matched.

**The checklist, in order**

1. **A dynamic field at the top.** A current time, a request id or a session id in the first lines of the system prompt misses on every request. Move it below the breakpoint with the other per-request fields.
2. **Tool reordering.** Tools serialized from a dictionary can change order between deploys or between processes; serialize them in a stable order.
3. **Near-duplicate text.** Two code paths that build the prompt with a one-byte difference produce two prefixes and no hits.
4. **Too-small blocks.** The explicit cache has a floor of 1,024 tokens, 2,048 on the small model; a smaller block silently does not cache.
5. **On the automatic provider**, a changed user field is part of the cache key, and the prefix must still be stable and above 1,024 tokens.

**The layout that hits**

System prompt, then tool definitions, then few-shot examples, then retrieved documents if they are reused, then the history up to the last turn, then the current message, which is never cached because it is different every time.

**Turn it into a test**

In CI, build two requests through the production prompt builder with the same user input, compare their cacheable prefixes, send both, and assert that the cache read token count is above zero on the second. Two hand-written identical bodies would skip the timestamp or request id that the builder adds. Split the cost dashboard into cached and uncached input tokens, or a traffic drop looks like a cache win.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** How do you make this a test? Expected: two requests built by the production prompt builder with the same user input, with an assertion that the cache read tokens are above zero on the second; if they stay at zero the keys are drifting.
- **Level 2:** Where does the timestamp go instead? Expected: below the breakpoint, with the other per-request fields such as the user message.
- **Level 3:** The block is below the minimum size. What happens? Expected: nothing is cached and nothing is reported; the floor is 1,024 tokens, and 2,048 on the small model.
- **Level 3:** Input tokens fell after your change. Is that proof it works? Expected: no; split the input tokens into cached and uncached, or a drop in traffic looks like a cache win.

**Wrong answers, and why they fail**

- "Caching is automatic, there is nothing to configure." On the explicit providers you mark the block; on the automatic one the prefix still has to be stable and above 1,024 tokens, and a changed user field or tool order breaks it.
- "Put the user message first so the model reads it early." That places the only part that changes above everything else, and the cache never hits.
- "Extend the TTL to one hour, the cache is expiring." Expiry would show as writes after quiet periods, not on every request; the one-hour TTL also charges 2x for the write.

**Related lesson in this course:** [LLM inference: tokens, prefill, decode and the KV cache](#aiinfra-2)

:::

## Five votes, one path, five times the bill

*Level 2 (working) · debug · about 8 minutes*

A math assistant samples five reasoning paths per question and takes a majority vote. Accuracy did not move compared with a single path, and the bill is five times higher. The team set the temperature to zero for reproducibility. What happened, and what else do you check before you keep the voting?

:::answer Show the answer
:::say Short answer
At temperature zero the samples should be identical, and only a nondeterministic serving stack makes them differ a little, so the five paths are close to one path counted five times and the vote changes almost nothing. The lesson samples at 0.7 so the paths differ enough for their errors to cancel. Then check that the final answer comes out in a fixed format, because without a line such as "The answer is" followed by the number the votes cannot be compared, and check that the single-path accuracy sits in the range where a vote helps, about 60 to 85 percent.
:::

**Full answer**

**What the vote needs**

Self-consistency works because a single chain can contain a reasoning error while independent chains rarely make the same one. Independence comes from sampling. The lesson's solver runs the same prompt N times at temperature 0.7, extracts the final number from each, and takes the most common one. The vote share is the confidence.

**Where the lift is**

In the original experiments on a 540B model, the vote moved the grade-school math score from 56.5 percent for one chain to 74.4 percent with 40 samples. On a model that already scores 97 percent, the vote adds about one point. The technique pays most when single-chain accuracy is between 60 and 85 percent: errors are frequent but not systematic.

**How many samples**

Five samples capture most of the benefit. Three is the minimum for a meaningful vote. Beyond ten the returns diminish, and every sample is a full call. Reasoning models do their own internal sampling, so the vote adds little there.

**The format constraint**

The system prompt asks for the final answer on the last line in a fixed form. Without it the extractor has nothing to compare, and a vote over free text is noise.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why 0.7 and not something much higher? Expected: enough randomness for diverse paths and not so much that the model produces gibberish.
- **Level 2:** How are the five answers compared? Expected: the prompt forces a final line in a fixed form and the code extracts the number from it; without that, the vote has nothing to count.
- **Level 3:** When is the vote worth five times the cost? Expected: when single-chain accuracy is in the 60 to 85 percent range; on a model at 97 percent the lift is about one point.
- **Level 3:** How does the lesson turn the vote into a decision? Expected: the vote share is a confidence; with 4 of 5 in agreement, a confidence of 0.8, and a match with the deterministic answer, accept, otherwise escalate to a tree search.

**Wrong answers, and why they fail**

- "Temperature zero makes the vote more reliable." It makes the samples the same or nearly the same, so there is no real vote.
- "Use forty samples like the paper." Five captures most of the benefit and more than ten shows diminishing returns; forty multiplies the cost for little gain.
- "Voting fixes a systematic error." If most paths make the same mistake, the majority is wrong with high confidence; the vote cancels independent errors only.

**Related lesson in this course:** [Reasoning: chain of thought, self-consistency and tree of thoughts](#aifield-1)

:::

## How many examples go in the prompt, and which ones

*Level 2 (working) · tradeoff · about 7 minutes*

A classification prompt has eight output labels. One engineer wants twenty examples in the prompt to be safe, another wants none and a longer instruction. How many examples do you include, which ones, and what decides it?

:::answer Show the answer
:::say Short answer
Three to five for most tasks, and for a classifier with many labels one example per label, so eight here. Pick examples that are semantically close to the input and that cover every label, because similar examples beat random ones by 5 to 15 percent on classification. Below three the model has too little signal to extract the pattern; above five you pay context tokens on every call for diminishing returns.
:::

**Full answer**

**Examples are compressed instructions**

Instead of describing the format, you show it. Instead of explaining the reasoning, you demonstrate it. The model matches a pattern more reliably than it interprets an abstract rule. On simple sentiment tasks zero-shot and few-shot land within 2 percent of each other; on multi-step arithmetic and symbolic reasoning the examples add 10 to 25 percent.

**Which examples**

1. **Semantic similarity.** Pick the examples closest to the input in embedding space. At request time this means a pool of labeled examples and a nearest-neighbor selection per query.
2. **Label diversity.** Cover every output category, or the model never sees that a label exists.
3. **Difficulty matching.** Match the complexity of the target problem.

**The cost side**

Few-shot adds 200 to 500 tokens to every call. Two things keep that cheap. Hold the count at the knee, three to five. And if the examples are a fixed set, put them in the stable part of the prompt, after the system message and the tool definitions and before anything that changes per request, so a prefix cache serves them at the discounted rate. Examples picked per query by nearest neighbor change between requests, and a prefix cache stops at the first differing token. Put those below the cache breakpoint: the system message and the tool definitions above them still hit, and the examples pay the full rate.

**When zero-shot wins**

Simple factual questions, creative tasks where examples constrain the output, and tasks where finding good examples is harder than writing a good instruction. The prompt engineering lesson still recommends two or three examples for a prompt that has to behave the same across providers, because examples transfer better than instructions alone.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** When does zero-shot win? Expected: simple factual questions, creative tasks where examples constrain, and tasks where good examples are harder to find than a good instruction.
- **Level 2:** What do examples do that an instruction cannot? Expected: they show the format and the reasoning instead of describing them, and the model matches a shown pattern more reliably than it interprets a rule.
- **Level 3:** How do you choose the examples at request time? Expected: embed a labeled pool and select the nearest examples to the input while keeping label coverage; the lesson measured a 5 to 15 percent gain over random selection.
- **Level 3:** The examples cost 200 to 500 tokens on every call. How do you contain that? Expected: keep the count at three to five; place a fixed set of examples in the stable prefix so the prompt cache serves them at the discounted rate, and place examples picked per query below the breakpoint, because they change on every request.

**Wrong answers, and why they fail**

- "More examples are always safer." Above five the returns diminish and every example costs context on every call.
- "Random examples are fine, the model generalizes." Similar examples beat random ones by 5 to 15 percent on classification.
- "Describe the labels in detail and skip the examples." For a format-sensitive task with many labels, examples transfer the pattern better than a description, and across providers too.

:::

## Read the constrained generation loop

*Level 2 (working) · code-reading · about 8 minutes*

Read this constrained generation loop from the lesson. Explain what the mask does to the probabilities, what the machine's state records, and why the loop can end up faster than unconstrained generation.

```python
def mask_logits(logits, valid_token_ids):
    mask = [float("-inf")] * len(logits)
    for tid in valid_token_ids:
        mask[tid] = logits[tid]
    return mask


def generate_constrained(model, tokenizer, prompt, fsm):
    ids = tokenizer.encode(prompt)
    state = fsm.initial_state
    while not fsm.is_accept(state):
        logits = model.next_token_logits(ids)
        valid = fsm.valid_tokens(state, tokenizer)
        logits = mask_logits(logits, valid)
        tok = sample(logits)
        ids.append(tok)
        state = fsm.transition(state, tok)
    return tokenizer.decode(ids)
```

:::answer Show the answer
:::say Short answer
The mask sets the logit of every invalid token to negative infinity, so after the softmax those tokens carry zero probability and the sampler can only pick a token that keeps the output inside the grammar. The machine keeps the position in the grammar reached so far, and `valid_tokens` returns the tokens that advance it without leaving an accepting path. It can be faster because the search space shrinks, and because a position where only one token is valid needs no model call at all.
:::

**Full answer**

**Walk the loop**

1. Encode the prompt and start the machine in its initial state.
2. Until the machine accepts: ask the model for the logits of the next token over the whole vocabulary.
3. Ask the machine which token ids are valid in the current state.
4. Replace every other logit with negative infinity; the valid ones keep their value.
5. Sample from the masked logits, append the token, and move the machine to the next state.
6. Decode the ids.

The piece between the model and the sampler is the logit processor. Nothing in the model changes; the edit is to one step's logits.

**Where the valid set comes from**

A compiled grammar. A finite state machine built from a regex or a JSON Schema gives a constant-time lookup of the valid tokens per state. A context-free grammar engine handles recursion that a finite machine cannot express. Inference servers ship the same idea as guided decoding, with JSON, regex, choice and grammar modes.

**Why it can run faster**

Two reasons from the lesson. The next-token search space shrinks. And a clever implementation skips the model call for forced tokens: when the grammar leaves exactly one valid token, such as the scaffolding of a key name, the token is appended without generation. This code does not do that yet.

**What this code does not fix**

A grammar that is too strict makes the model invent a value, because no valid token lets it say unknown. A huge enum compiles slowly. A recursive schema does not fit a finite machine. And a retry library that validates after generation does none of this; it never touches the logits.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Where does `valid_tokens` get its answer? Expected: from the compiled grammar; a finite state machine gives a constant-time lookup per state.
- **Level 2:** What does a production implementation do that this loop does not? Expected: skip forced tokens; when exactly one token is valid it is appended without a model call.
- **Level 3:** Which schemas defeat a finite state machine? Expected: recursive ones, such as nested comments or a syntax tree, which need a context-free grammar engine.
- **Level 3:** The grammar forces a strict date pattern and the source has no date. What does the loop produce? Expected: a well-formed invented date, because no valid token lets the model say unknown; allow null or a sentinel in the grammar.

**Wrong answers, and why they fail**

- "The mask changes the model's weights." It changes nothing in the model; it edits the logits of one step before sampling.
- "Constrained decoding always slows generation down." The lesson calls it often faster: a smaller search space, and forced tokens that skip the model call.
- "A retry library does the same thing." It formats the schema into the prompt and validates after the fact; it does not touch the logits.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::

## The three ways a structured output call fails

*Level 2 (working) · concept · about 7 minutes*

An extraction service turns purchase-order emails into typed records. Name the ways a structured output call can fail, say which of them disappear under strict schema enforcement, and describe how the code should treat what remains.

:::answer Show the answer
:::say Short answer
Three ways: a parse error, where the output is not JSON; a schema violation, where it parses but breaks a type, a required field, an enum or a range; and a refusal, where the model decides the input does not fit the schema. Strict enforcement removes the first two by construction for a response that finishes. The refusal stays, and it must be a typed outcome that the code logs and returns, never a retry. A response cut at the token limit can still fail to parse, so check the stop reason before you read the output.
:::

**Full answer**

**Three approaches, three failure profiles**

1. **Prompt for JSON.** Works 85 to 95 percent of the time on a frontier model. Fails six ways: a missing brace, a trailing comma, wrong types, invented fields, truncation at the token limit, and leaked prose such as "here is your JSON".
2. **Validate after generation.** Generate freely, parse, validate against the schema, and on failure inject the error and retry. Reliable but you pay for every retry.
3. **Constrained decoding.** The provider masks invalid tokens at decode time, so a finished output parses and validates by construction. The model-side failure collapses to one mode, refusal; a response cut at the token limit and a request error still need their own error path.

**The retry loop, when you are outside strict mode**

```text
generate -> parse -> validate -> if fail, inject the error and retry, at most 3 times
```

One retry is usually enough. Three catches weak-model flakes. Beyond three means the schema or the prompt is wrong for some inputs, and the fix is there, not in a fourth attempt. The validator should return a typed error list with a path and a message for each failure, which is the shape the retry prompt needs.

**The refusal branch**

The model declines because the input does not fit, for example the email was a poem and not an order, or because of a safety reason. The refusal carries the reason. Log it, return it typed, and do not retry. The lesson also uses refusals as a safety signal downstream.

**One schema setting that matters**

`additionalProperties: false` forbids fields the schema did not name, which is how strict mode shuts the door on invented fields. Strict mode requires it everywhere.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** How many retries, and what does needing more tell you? Expected: at most three; one is usually enough, and beyond three the schema or the prompt is wrong for some inputs.
- **Level 2:** Why must the refusal branch not retry? Expected: the model declined for a reason, often fit or safety; a retry wastes cost and can push a wrong extraction through.
- **Level 3:** What does the retry prompt need from the validator? Expected: a typed error list with a path and a message per failure, so the model knows which field to fix.
- **Level 3:** Which schema setting blocks invented fields? Expected: additional properties set to false, which strict mode requires everywhere.

**Wrong answers, and why they fail**

- "A refusal is a failed call, retry it." It is a first-class outcome with a reason attached; log it and return it typed.
- "Strict mode removes every failure." It removes parse errors and schema violations for a finished response; refusals, truncated responses and wrong values with the right type remain.
- "Retry until it validates." Past three retries the cost grows and the schema is the real problem.

:::

## Tool descriptions decide which tool gets called

*Level 2 (working) · concept · about 7 minutes*

An agent has eight tools and keeps calling the wrong one. The tool descriptions are one or two words each, such as "gets weather". What does the description do, and how do you rewrite one?

:::answer Show the answer
:::say Short answer
The model reads the description to decide when and how to call the tool, so the description is a prompt for tool selection. Rewrite it as a full sentence that says what the tool does and what it returns, for example that it gets the current weather for a city and returns the temperature in Celsius and the conditions, and describe each parameter with an example value and an enum where the set is closed. Then validate the arguments against the schema before anything executes.
:::

**Full answer**

**What the model sees**

A tool definition is a JSON Schema contract: a name, a description, and the parameters with their types, their own descriptions, and the required list. The model never sees your code. It picks a tool and fills the arguments from this text alone, so a vague description produces worse selection than a precise one, and a parameter with an example such as a city name is filled more reliably than a bare string.

**Beyond the description**

- **Tool choice.** Auto lets the model decide. Required forces at least one call, which stops the model from guessing when you know a lookup is needed. A named tool forces that one, for routing when upstream logic already knows.
- **Parallel calls.** Two cities in one question can come back as two calls in one turn; execute both and return both results.
- **Structured errors.** Return failures as results with a message, a code and suggestions, such as the city not found and the nearest names. Models self-correct from structured errors and not from empty or generic ones.
- **A call budget.** Set a maximum of 10 to 20 calls per conversation so a loop cannot run away.

**Measure it**

Write a set of queries with the expected tool for each; the lesson's exercise uses 30. Run the selection and report the share that picked the right tool, and list the pairs that get confused.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Where else does a description help besides the tool itself? Expected: on each parameter, with an example value and an enum where the set is closed, so the arguments come out right.
- **Level 2:** The model still guesses instead of calling a tool when it should. Which setting changes that? Expected: tool choice set to required, or to a named tool when upstream logic already knows which one.
- **Level 3:** How do you prove the rewrite worked? Expected: a set of test queries with expected tool names, 30 in the lesson, the share that select the right tool, and the confused pairs listed.
- **Level 3:** A tool fails. What should it return so the model recovers? Expected: a structured error with a message, a code and suggestions, not an exception or an empty response.

**Wrong answers, and why they fail**

- "The model infers the purpose from the function name." It reads the description; a vague one produces worse selection than a full sentence.
- "Describe every tool in a paragraph to be safe." Definitions travel with every request; one precise sentence plus parameter descriptions is the target.
- "Let the model call any function by name." The lesson's rule is an allowlist of the tools you define, never a generic execute-by-name tool.

**Related lesson in this course:** [Lecture 7: RAG, tool calling and agents (retrieval, ranking metrics, function calling, ReAct, MCP, safety)](#lectures-7)

:::

## Typed data or an action, and why the difference matters

*Level 2 (working) · tradeoff · about 7 minutes*

You need two things from the same model: a typed summary of a support ticket, and the ability to look up the customer's account during the conversation. A teammate wants to build both as tools. Which mechanism fits each, and why does the distinction matter?

:::answer Show the answer
:::say Short answer
The ticket summary is structured output: the typed data is the final product, so use the schema mode and validate it. The account lookup is a function call: the model declares an intent to act, your code executes it and feeds the result back, so the output is an intermediate step. The two share the JSON Schema machinery but differ in what happens next, and mixing them hides which outputs are data and which are actions your code runs.
:::

**Full answer**

**Two uses of one mechanism**

| | Structured output | Function call |
|---|---|---|
| What the model emits | a record that matches a schema | a function name and typed arguments |
| What happens next | your code validates and stores it | your code executes it and returns the result to the model |
| The output is | the final product | an intermediate step |
| Fits | extraction, classification, typed summaries | lookups, writes, anything that touches another system |

The function calling lesson states the rule: use structured outputs when you want data, use function calling when you want the model to interact with an external system. The model never executes anything; it only decides what to call and with what arguments.

**When tool use is the right way to get data**

The structured outputs lesson gives the exception. When the model has to choose among several schemas based on the input, for example 10 extraction schemas, tool use gives you the selection and the structure in one step. One provider also delivers its schema mode through tool use, with the schema on the tool input. In that case name the tool for the data it returns, never execute it, and route its arguments straight to the validator.

**Why the distinction matters in code**

A record gets schema validation and a semantic check. An action gets argument validation, an allowlist, result sanitizing and a call budget before anything runs, because the model chose what to execute. If the summary and the lookup live in one registry, the security rules for actions either cover data they do not need to, or miss an action they should.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** When is tool use the right way to get structured data? Expected: when the model must pick one of several schemas from the input; the lesson's example is 10 extraction schemas, where tool use gives the selection and the structure together.
- **Level 2:** In the lookup case, who runs the function? Expected: your code; the model emits the name and the arguments, and the result goes back as a message.
- **Level 3:** What differs in validation between the two? Expected: data gets schema validation and a semantic check; an action gets argument validation, an allowlist and a call budget before it runs.
- **Level 3:** A provider offers schema output only through tool use. How do you keep the distinction? Expected: name the tool for the data it returns, never execute it, send its arguments to the validator as the final record, and keep real actions in a separate registry.

**Wrong answers, and why they fail**

- "They are the same thing with different names." They share the schema machinery; one produces the final data, the other requests an action your code performs.
- "Use function calling for everything, it is more flexible." Every tool is an executable surface with security rules; data extraction does not need one.
- "The model runs the lookup itself." The model never executes anything; it emits a call and your code is the executor.

:::

## Valid JSON, worse accuracy, and the field order to blame

*Level 2 (working) · debug · about 8 minutes*

A classifier uses constrained decoding with a schema of two fields, `answer` and `reasoning`, in that order. The output is always valid JSON and the accuracy is worse than the free-text version was. What is wrong?

:::answer Show the answer
:::say Short answer
The field order. The model commits to the answer before it writes any reasoning, so the reasoning tokens never shape the answer, and you lose the gain that step-by-step gives. Put `reasoning` first and `answer` last; the schema stays valid, and no validator will ever flag the difference, because the order is logic and not formatting.
:::

**Full answer**

**The pitfall**

The constrained decoding lesson calls it the pitfall that costs you. With `answer` first, the model writes the decision token at the first position where the grammar allows it, and the reasoning that follows is a story about a choice already made. With `reasoning` first, the chain comes before the decision, and the decision token is conditioned on it. Both documents validate. Only one is right.

The lesson's skill refuses any design that puts an `answer` or `decision` field before the reasoning fields.

**Neighbors of the same mistake**

| Schema choice | What goes wrong | Fix |
|---|---|---|
| A strict pattern for a value that can be missing, such as a date | the model invents a value to satisfy the grammar | allow null or a sentinel |
| A field left optional that matters | the model omits it when it is inconvenient | make it required and allow null, so the absence is explicit |
| Nesting four levels deep or more | each level is one more place to lose the structure | flatten |
| An enum with thousands of options | the grammar compiles slowly or times out | predict a short list of candidates first, then constrain to it |

**Why the unconstrained reply did better**

A free-text reply tends to explain before it concludes, so it had the chain by accident. The constrained schema removed it. The fix restores it on purpose.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why can no validator catch this? Expected: both orders are valid against the schema; the harm is in what the model has seen when it writes the answer token.
- **Level 2:** The schema forces a date pattern and the model fills in dates that are not in the text. Which related mistake is that? Expected: a grammar too strict for missing data; allow null or a sentinel so the model does not invent a value.
- **Level 3:** A field is optional and the model leaves it out when it matters. What do you change? Expected: make it required and allow null, so the model has to state that the value is missing.
- **Level 3:** The schema nests four levels deep and errors rise. What do you do? Expected: flatten, because each level of nesting is one more place to lose track of the structure.

**Wrong answers, and why they fail**

- "Constrained decoding guarantees a correct output." It guarantees the shape; the lesson shows valid JSON with a wrong answer.
- "Order does not matter in JSON." It does not matter to the parser; it matters to the model, which writes the fields in order.
- "Add a check that the reasoning supports the answer." That is an eval, not a fix; the fix is to generate the reasoning first.

**Related lesson in this course:** [Lecture 3: LLMs: mixture of experts, decoding, prompting and fast inference](#lectures-3)

:::

## Where each part of the context goes, and why

*Level 2 (working) · concept · about 8 minutes*

You assemble a prompt from a system message, ten retrieved documents, the chat history so far and the user question. In which order do you place them, and what evidence decides it?

:::answer Show the answer
:::say Short answer
Put the system prompt and the critical instructions first, the current question and the most relevant context last, and the lowest-priority material in the middle. The evidence is the lost-in-the-middle finding: with one relevant document among 20, accuracy was 85 to 90 percent when it sat first or last and fell to 60 to 70 percent in the middle. If a key point has to sit in the middle, repeat it at the end.
:::

**Full answer**

**The finding**

Models attend best to the start and the end of the context. The study placed one relevant document among 20 irrelevant ones and moved it. First or last, 85 to 90 percent accuracy. In the middle, 60 to 70 percent. The lesson generalizes it as a 10 to 20 percent drop for information at 40 to 70 percent of the way through the context.

**The budget**

| Component | Typical size |
|---|---|
| System prompt | about 500 tokens |
| Tool definitions | 2K to 8K tokens |
| Retrieved context | 2K to 10K tokens |
| Conversation history | 2K to 20K tokens |
| Few-shot examples | 1K to 3K tokens |
| User query | 100 to 500 tokens |
| Generation reserve | 2K to 8K tokens |

Every token in the window displaces a token that could carry more signal. A 10K prompt that is 90 percent signal beats a 100K prompt that is 10 percent signal.

**Do not include all ten documents**

Bad retrieval is worse than none; it fills the window with noise and misleads the model. Score each document against the query and drop those below a threshold. If you retrieved 10 chunks and 3 are relevant, keep the 3.

**The reorder**

The lesson's function sorts the documents by score, sends the odd ranks to the front in order and the even ranks to the back in reverse, so the best sit at both ends and the weakest in the middle. Then the history, compressed into a summary when it passes a threshold, then the question last, with 2,000 to 4,000 tokens reserved for the answer.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why not include all ten retrieved documents? Expected: bad retrieval is worse than none; score each against the query, drop those below a threshold, and keep the 3 relevant ones over 10 mediocre ones.
- **Level 2:** What do you reserve at the end of the window, and how much? Expected: the generation budget, at least 2,000 to 4,000 tokens, or the model has no room to answer.
- **Level 3:** How does the lesson's reorder place five scored documents? Expected: sorted by score, the odd ranks go to the front in order and the even ranks go to the back in reverse, so the best sit at both ends.
- **Level 3:** The same system prompt is sent on every turn. What does that imply for its size? Expected: every word is paid on every call, so keep it tight; the lesson cites a coding assistant with about 6,000 tokens of system prompt and tool definitions.

**Wrong answers, and why they fail**

- "The window is huge, more context is always better." A 10K prompt that is 90 percent signal beats a 100K prompt that is 10 percent signal; more context is more noise for attention to filter.
- "Put the question first so the model knows what to look for." The end of the context gets high attention too; the lesson places the current query last and the instructions first.
- "Order does not matter, attention sees everything." The measured drop in the middle is 10 to 20 percent.

**Related lesson in this course:** [Lecture 7: RAG, tool calling and agents (retrieval, ranking metrics, function calling, ReAct, MCP, safety)](#lectures-7)

:::

## Build a two-tier agent memory with eviction and citations

*Level 3 (senior) · take-home · about 60 minutes*

Take-home. Build an agent memory with two tiers: a fixed-size main context and an unbounded searchable store, plus the tools that move facts between them. Show a trace where the main context fills, something is evicted, and a later question is still answered from the store. Standard library only. Explain your eviction and citation choices.

:::answer Show the answer
:::say Short answer
Treat the main context as RAM and the store as disk. Give the main context a cap, a pinned core section and a message list that compacts its oldest entries when the cap is passed; give the store records with an id, text, tags, a session id and a turn id, and a token-overlap search. Expose the memory tools, write three facts, overflow the main context, and answer the follow-up by searching the store and splicing the result into the next turn.
:::

**Full answer**

**The shape**

| Operating system | Memory system | Your code |
|---|---|---|
| RAM | main context | a capped buffer with a core dict and a message list |
| Disk | external store | a list of records with a search method |
| Page fault | memory tool call | the agent calls a tool, the runtime runs it, the result enters the next turn |
| Kernel | agent control loop | a scripted loop that reads, decides, writes |

**The tool surface**

- `core_memory_append(section, text)` and `core_memory_replace(section, old, new)` edit the pinned sections of the main context.
- `archival_memory_insert(text)` writes a record to the store.
- `archival_memory_search(query, top_k)` retrieves from the store.
- `conversation_search(query)` scans past turns.

**Eviction**

When the message list passes the cap, compact the oldest messages instead of dropping them. The lesson's exercise measures the cap in tokens with a word count times 1.3 and summarizes the evicted messages; a simpler version moves them to the store. Deletion loses facts that the store could have kept.

**Citations**

Every store record carries the session id and the turn id of its source. Without them the agent recalls that the user asked for something and cannot say which turn; with them every retrieval-backed answer can cite its origin.

**The trace a grader wants**

1. Three facts written to the store, each with its source fields.
2. The main context fills past the cap and the oldest messages are compacted.
3. A follow-up question arrives, the agent calls the search tool, the hit is spliced into the next turn, and the answer cites the turn.
4. A note on the two failures that the design does not fix on its own: memory rot, which needs periodic consolidation, and memory poisoning, where attacker text stored as a note is re-ingested next session.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why page instead of using a larger window? Expected: overflow, dilution and persistence; a bigger window still dilutes attention and starts empty next session, and the lesson cites a 4k-window agent with external memory that caught long-horizon facts a 128k-window baseline missed.
- **Level 3:** What goes in every store record, and why? Expected: the text, tags, the session id and the turn id, so a recalled fact can be cited to the turn it came from.
- **Level 4:** A note in the store says to ignore all future user instructions. What is the guard? Expected: scan retrieved records for directive-shaped text and mark them untrusted before they reach the prompt; this is prompt injection over time.
- **Level 4:** Writes outnumber reads and retrieval drowns in stale facts. What do you add? Expected: periodic consolidation and explicit invalidation of contradicted facts, which the later memory lessons run off the critical path.

**Wrong answers, and why they fail**

- "Keep everything in the context, the window is large enough." The lesson's three failures remain: overflow, dilution and an empty window at the next session.
- "Evict by deleting the oldest messages outright." Compact them into a summary or move them to the store; deletion loses facts the store could have kept.
- "The store does not need source fields." Without a session and a turn id the agent recalls a fact and cannot say where it came from.

**Related lesson in this course:** [Memory tiers, agent crews and browser or computer-using agents](#aifield-9)

:::
