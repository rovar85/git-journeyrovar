---
track: aibank
title: "AI interview bank: Evidence and reverse engineering"
short: Evidence and reverse e
sub: 14 AI engineering interview questions, folded answers, follow-ups and the wrong answers to avoid.
---

:::note Source and licence
These questions come from the open-source [AI Engineering from Scratch interview bank](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare (MIT licence), reformatted for this course: answers are folded so you can try first, links to that project's own lessons were removed, and a related lesson from this course is linked instead (where an answer says "the lesson" or "the manual", it means the source project's own material). Version numbers, hardware and measurements in the questions are from that project's own captures; they date quickly, so treat them as examples of how to reason.
:::

Try each question first, then open the answer. The flashcards in the Study view use the short answers.

## Three words for one sentence about grade(55)

*Level 1 (screening) · concept · about 6 minutes*

An agent asks a decompiler for `grade`, reads the default branch of the pseudocode, and reports "grade(55) returns 0, observed". The pseudocode line is `uVar1 = -(param_1 >> 0x1f) ^ (uint)((ulong)((long)param_1 * 0x66666667) >> 0x3f);` and the bytes at that point are `xor eax, eax`. Which of the three confidence words belongs on each claim hidden in that sentence?

:::answer Show the answer
:::say Short answer
Confidence is one of three words and never a number: `observed` is a fact read from bytes or from a run, `derived` is a fact computed from observed records, and `inferred` is an expectation that no observation states yet. The record is observed about what the decompiler printed, with authority `shipped-artifact`, because the file on disk was the source. That the default value is 0 is derived, from the listing's `xor` and from the expression, which is always 0 and never says 0. That `grade(55)` returns 0 when the function runs stays inferred until an `execute_function` record with authority `controlled-replay` agrees with it.
:::

**Full answer**

**The two enums**

| Value | Meaning |
|---|---|
| `observed` | read from bytes or from a run |
| `derived` | computed from observed records |
| `inferred` | an expectation no observation states |
| `shipped-artifact` | the file on disk was the source |
| `controlled-replay` | a run you controlled produced the fact |
| `analyst-inference` | your own judgement |
| `historical-reference` | an older tree or document |
| `external-service` | a service outside the file and the host |

When a producer says nothing, the record gets `observed` and `shipped-artifact`. Read `observed` with care: in a function dossier it means that the tool recorded what the decompiler returned, with the bytes as authority. It does not mean the pseudocode is the program's source.

**The two confusions that cost the most**

The first treats pseudocode as an observation of behaviour. It is an observation of what the decompiler printed. The expression above and the instruction both produce 0 for every input, and the agent did not know that; it trusted text because a tool produced it. The second treats an empty list as proof of absence. Missing coverage is unknown, not absence.

**How a claim moves**

A claim moves from inferred to supported only through observed runs: `pass` when every input has an agreeing run and none disagrees, `fail` when any run disagrees, `unknown` when some inputs have runs and others do not, `unsupported` when no input has a run. A run of a host build of the same source counts, with the limitation that the object itself never ran. That sentence travels with the claim, because a report that drops it has lost information the reader needs.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** Why is confidence a word rather than a probability? Expected: the three words name the kind of support, and a number would hide which kind it was.
- **Level 2:** A run of the same source compiled for the host agrees with the prediction. Is the claim about the x86-64 object observed? Expected: yes, with the limitation that a host build ran and the object did not; it is the strongest observation without an emulator.
- **Level 2:** Which authority does a run under your own harness receive? Expected: `controlled-replay`, as opposed to `shipped-artifact` for a read of the file.
- **Level 3:** The decompiler's signature says the function returns 16 bytes and takes a third parameter. Which word? Expected: the provider's inference; the dossier marks its return-type confidence low, and the record should say so.

**Wrong answers, and why they fail**

- "It is observed because a tool produced it." The tool's text is observed; the behaviour it describes is derived or inferred.
- "Give it a confidence of ninety percent." Confidence is a category with three values, not a number.
- "The expression is a decompiler bug." It is correct and unreadable; two spellings of one bit cancel, and the instruction says it in two bytes.

:::

## callers is empty and coverage says complete

*Level 1 (screening) · concept · about 6 minutes*

In the record, the dossier for the function `_grade` lists `callers: []` and `callees: []`, and its `relationship_coverage.status` reads `complete`. The agent writes "nothing calls grade". What does the record support, and what would make the agent's sentence true?

:::answer Show the answer
:::say Short answer
`complete` means the engine returned every resolved call reference without a known read limit; the diagnostic beside it says that unresolved computed or indirect calls remain unknown. The one incoming reference is a `DATA` reference from the function starts table, not a call instruction, so the record supports "no resolved call instruction targets this function in this build". The design rule is that missing coverage is unknown, not absence, and the agent's sentence needs either a run or an argument that covers indirect calls, so the honest move is to record a residual unknown with the probe that would close it.
:::

**Full answer**

**Three values and a null**

`relationship_coverage` states how complete the caller and callee sets are: `complete`, `partial` with its limitations and the limited direction, or `unknown` with a reason, and `null` for an operation that reports no call relationships. Provider caveats stay in `limitations` and do not make the coverage partial. One part of a dossier does declare its coverage in numbers: the value flow reports whether it was truncated and how many operations, inputs and edges it omitted. A zero there is a count the tool stands behind; an empty array elsewhere is a count with no such statement.

**The same lesson in two other empty lists**

A bundle comparison across two builds lists ten records that are in one bundle only and classifies every one as `unknown` with the kind `unresolved_branch`, because a bundle has no marker that says it is complete. A summary view of a six-file application reports `semantic_unknowns: 118` and marks its coverage `unknown`. Each one proves that nothing was observed, never that nothing exists.

**The record for what is still open**

A residual unknown is a durable record with an `unk_` id, a revision chain, a status and the evidence that would close it. The id is a hash of the domain, the question with whitespace collapsed, and the scope digest of the target, so two analysts who ask the same question about the same file get the same id, and a second `record_unknown` answers `already-exists`. Every change is a new revision that names the digest of the one before, each mutation is itself an evidence record with authority `analyst-inference`, and only an observed record of the required authority can mark a resolution `verified`. The unknown for this dossier asks whether anything calls `_grade` at run time, and its probe is a run or a read of the computed targets.

**Follow-ups** (answer before you read the Expected part)

- **Level 1:** The dossier does list a single incoming reference. What is it? Expected: a `DATA` reference from the function starts entry, which the unwinder and crash reporter use, not a branch instruction.
- **Level 2:** Why does a zero in the value-flow counts carry more weight than an empty callers array? Expected: the count is a declared statement about truncation that the tool stands behind, while the array has no completeness statement beyond resolved references.
- **Level 2:** How do you write the open question down so it survives the session? Expected: `record_unknown` with the question, the required authority and confidence, and a recommended probe; the id derives from the question.
- **Level 3:** Two analysts update the same unknown. What stops the second from overwriting the first? Expected: `update_unknown` takes `expected_revision` and answers `revision-conflict` when it is stale, so the second rereads the head and decides again.

**Wrong answers, and why they fail**

- "`complete` means every call that can happen." It means every resolved reference was returned; indirect and computed calls stay unknown.
- "An empty list means none." It means none observed; the design rule says missing coverage is unknown.
- "Close the unknown with a sentence in the report." A resolution needs evidence ids of the required confidence and authority, never prose.

:::

## Every byte decoded, and the jump lands inside an instruction

*Level 2 (working) · debug · about 8 minutes*

A 24-byte function keeps a four-byte table `31 c0 90 48` inside its body and jumps over it with `jmp 0x14`. `llvm-objdump -d` prints `xorl %eax, %eax`, `nop`, and `addq $0x1, %rax` at `0x13`; every byte decodes and a `retq` is present. Name the three ways this listing is wrong, say which method gets it right and why the reference tool shares the mistake, and say what agreement between your decoder and that tool does and does not prove.

:::answer Show the answer
:::say Short answer
The listing is wrong three times: the jump at `0xe` targets `0x14` and no instruction in the listing starts there; the instruction that runs at `0x14` is a 32-bit `addl $0x1, %eax`, while the listing shows a 64-bit `addq` one byte early because the table's last byte `48` was swallowed as a REX prefix; and the four table bytes appear as code. Recursive descent from the symbol follows the jump, decodes six instructions, reads `addl` at the target and claims no table or padding byte. `llvm-objdump` is itself a linear sweep, so it inherits the sweep's blind spot: agreement with it checks the decoder on instruction boundaries, and only the descent checks which instructions run.
:::

**Full answer**

**Two methods, opposite failures**

A linear sweep starts at the first byte of the code section, decodes one instruction, continues at the byte after it, and stops at the end; data inside code gets decoded as instructions, and on x86 the decoder usually re-synchronises within a few bytes, which is why the error is hard to see and why the method is said to fail silently. Recursive descent starts at a known entry, follows direct jumps and both arms of a conditional, continues after a call, stops at a return, and keeps a visited set. Its failure is the opposite one: an indirect jump has no target in its bytes, so the walk stops there and every block reachable only through it stays unknown, which is what happens at `jmpq *%rax` in the unoptimized `grade`.

**The trap under five tools**

The comparison harness reports the sweep with 8 instruction starts in the trap range, with extra starts at `0x10`, `0x12` and `0x13` and a missing start at `0x14`. Three graph builders report 6 starts, 2 blocks and 1 edge, and leave `0x10` to `0x14` unclaimed. One framework also invents a function on the table bytes, two instructions in a four-byte block, so the REX byte at `0x13` belongs to no instruction. The last finding is the useful one: no graph builder decodes `0x10` to `0x14`, so those bytes sit inside a function and are data.

**What the oracle is for**

The decoder must agree with `llvm-objdump -d` on every instruction of every fixture, and it does, on 86, 56, 84 and 11 instructions, 237 in all. That agreement proves the decoder reads prefixes, opcodes, ModRM, SIB, displacements and immediates the way the manual says. It proves nothing about reachability, because the oracle never asked. A measurement of nine disassemblers on 981 compiler-generated binaries found inline data rarer than the literature assumed and function starts the hard primitive; the trap is rare in compiler output, and the indirect jump is common.

**Byte accounting**

Compare the two methods byte by byte. Bytes that only the sweep claims are padding, data, code behind an indirect jump, or code of a function with no known entry. The sweep decodes the whole section, so these are the bytes to account for. Bytes the descent claims are the ones it reaches from that entry; that is reachability, not proof that they run.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Change the last table byte from `48` to `e8` and rebuild. What does the sweep print? Expected: a `callq` that swallows the `addl` and the `retq`, with a target outside the section; the function appears to have no return.
- **Level 3:** Why does the descent stop at `jmpq *%rax` in the unoptimized `grade`, and what fixes it? Expected: no target is in the bytes; the resolver reads the five relocations of the table and pushes four distinct targets.
- **Level 3:** What does "fail silently" mean in operational terms? Expected: the decoder re-synchronises within a few bytes and detects nothing unless it hits an invalid opcode, so a wrong listing looks complete.
- **Level 4:** How do you classify bytes that the descent does not claim? Expected: padding, data, code behind an indirect jump, or part of a function with no known entry; account for every byte as one of these or as reached by the descent.

**Wrong answers, and why they fail**

- "The reference tool is right because it is the reference." It is a sweep; it is the oracle for decoding, not for reachability.
- "Use the descent alone." It stops at indirect jumps and leaves reachable code unknown until a table is recovered.
- "Every byte decoded, so the listing is complete." A listing says which bytes form which instruction, not which instructions run.

:::

## Four tests pass and the rebuild is 26 bytes long

*Level 2 (working) · debug · about 8 minutes*

From the decompiler's pseudocode, an agent rebuilds `percent_change`. The pseudocode reads `undefined1 [16] percent_change(int param_1, int param_2, ulong param_3)` with `lVar1 = (long)((param_2 - param_1) * 100)`. The rebuild is `(int)(((long)after - before) * 100 / before)`, and four hand-written tests pass. The listing of the same record reads `IMUL EAX, ESI, 0x64`, `CDQ`, `IDIV EDI`. What went wrong, and what is the rule?

:::answer Show the answer
:::say Short answer
The 16-byte return and the third parameter are the decompiler's inference, not the program: `idiv` writes the pair `EDX:EAX`, the zero path leaves `EDX` untouched, so the decompiler modelled a 16-byte result and read `%rdx` as an input. The listing says every operation is 32 bits wide, so the honest rebuild is `100 * (after - before) / before` in `int`; the `long` version divides the unwrapped product and fails 26 of the overflow cells while compiling to 26 bytes where the original has 16. The rule is to read the listing before the pseudocode, write the rebuild from the operation widths, and cite the record id it came from.
:::

**Full answer**

**Instruction or guess, line by line**

| Difference | Verdict |
|---|---|
| return type `undefined1 [16]` against `int` | guess; `idivl` writes two registers and no caller fixes the width |
| `param_3` | guess that follows from the first; `%rdx` is read on the zero path only because the return width was guessed |
| `lVar1 / (long)param_1 & 0xffffffff` against `/ param_1` | instruction; `cltd` plus `idivl` is a sign-extended 32-bit division, and both texts describe it |
| `if (param_1 != 0)` first | instruction order; the branch jumps to the zero return, and either arm may be printed first |

A difference with an instruction behind it is a presentation choice. A difference with no instruction behind it is a guess, and the guess can be on either side.

**Why four tests passed**

The naive cases avoid every hard class. The wrapped and unwrapped products agree whenever `(after - before) * 100` fits in 32 bits, so a test that never crosses that line sees two equal functions. On a grid with overflow cells, the `long` rebuild fails 26 cells, every one with `|before| > 1`; for `before` equal to 1 or -1 the 64-bit quotient truncates back to the wrapped value and the two agree by accident.

**The size told you first**

Compiled with the original flags, the `long` rebuild is 26 bytes: `movslq`, `imulq`, `cqto` and `idivq` replaced the 32-bit forms. Size is a diagnostic and never an acceptance, and the listing had shown the widths before any compile.

**What the research says about this pattern**

A 2026 study of decompilation systems found candidates that passed every test in a benchmark and still diverged on fuzzed inputs. The strongest refinement model raised the build rate from 75 to 90 percent while the behavioural match rate fell from 74 to 62 percent, and the cause was invented fields, types, callees and guards that replaced the visible unknowns a decompiler leaves in its text. The `long` rebuild is an invented type.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why did the four tests not catch it? Expected: none of them made the product exceed 32 bits, and the two versions agree everywhere the product fits.
- **Level 3:** Which inputs expose the difference, and which hide it by accident? Expected: overflow cells with `|before| > 1` fail; `before` of 1 or -1 agree because the wide quotient truncates to the wrapped value.
- **Level 3:** What did the 26-byte size tell you before any run? Expected: wider instruction forms replaced the 32-bit ones, so the candidate computes in a different width than the listing.
- **Level 4:** How does the refinement-model finding change how you read clean pseudocode? Expected: a clean signature is right for the wrong reason when it fills an unknown; keep the ugly honest form and record what no instruction supports.

**Wrong answers, and why they fail**

- "The decompiler is broken; ignore its output." Its instructions were right; only the parts the instructions leave open were guessed, and the listing in the same record is the correction.
- "The `& 0xffffffff` is a decompiler bug." It describes the truncation of a sign-extended division correctly.
- "Ten tests pass, ship it." A grid with overflow, negative, rounding and trap cells is the test; the ten cases avoided every hazard.

:::

## Same id on two machines, refused after one deleted line

*Level 2 (working) · concept · about 8 minutes*

Two machines analyze the same object in different folders and get the same `ev_` id. A colleague copies one record, deletes one limitation sentence to shorten it, and the file no longer imports. Later an untouched bundle written by an older release fails the same way. Explain all three outcomes from the id rule.

:::answer Show the answer
:::say Short answer
The id is a content hash: `ev_` plus a SHA-256 over the RFC 8785 canonical JSON of a projection of the record, where the projection keeps the subject's `digest`, `format` and `architecture`, drops `name` and `local_path`, and hashes everything else, `raw_result` and every limitation included. So a moved file keeps its id, a dropped limitation changes the content and the validator refuses it with "Evidence semantic identifier does not match its record", and the older bundle fails because the id rule itself moved: the older release left a `null` `relationship_coverage` out of the hash and the current one hashes it, so the first record with `null` coverage fails `evidence_integrity_mismatch`. Saved evidence is not migrated; regenerate it with the release you run.
:::

**Full answer**

**The recipe**

Canonical JSON sorts object keys, removes whitespace and fixes number and string forms. For records whose numbers are integers, a standard-library `json.dumps` with sorted keys and compact separators produces the same bytes, which is why a few lines of Python or Node recompute every captured id. Floats are refused before hashing, because the canonical form and the language runtime can print them differently. The analysis profile digest is a separate SHA-256 over `{provider, parameters}`, and a profile whose provider differs from the record's provider is rejected.

**What is inside and what is outside**

A path in `subject` is outside the hash. A path anywhere else is inside it: two captured files failed to match because the capture kit masked a directory inside `normalized_result` and `locations`, so a record that carries a path there gets a different id on every machine. Keep paths out of results and locations in your own records. A limitation is content on purpose: dropping one makes the record look stronger than the facts allow, and a later reader cannot repair that, so the id breaks.

**Rebinding without rehashing**

A record can be shown under a new path with a rebind that refuses when the digest, format or architecture differ. Snapshot replay does the same when it writes the open target's path into a stored record: the `evidence_id` does not change, because the path was never in it.

**The error envelope**

Every error has the same five fields: `code`, `category`, `message`, `retryable`, `remediation.action`, and optional `details`. The refused bundle names the failing record by index and says which field failed. `invalid_request` is retryable with corrected arguments; `evidence_integrity_mismatch` is not.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why leave the path out of the hash at all? Expected: the same observation of the same bytes should carry one id on any machine and in any folder; identity belongs to the content, not to where the file sits.
- **Level 3:** A producer writes an absolute path into `locations`. What happens when a colleague imports the bundle? Expected: the unchanged bundle still imports, because the stored path hashes to the stored id; but the same observation made on the colleague's machine carries their path and gets a different id, and any edit that masks the path breaks the id. Locations hold addresses and relative artifact paths, not host paths.
- **Level 3:** Why does a limitation count as content and not as a comment? Expected: without it the record claims more than the provider did, and nobody downstream can tell.
- **Level 4:** How do you handle the older bundle? Expected: regenerate it with the current release, since the rule changed and ids are not migrated; never patch an id by hand.

**Wrong answers, and why they fail**

- "Ids are random identifiers assigned at write time." They are content hashes, which is why two machines agree.
- "Trim limitations to save context tokens." Each one is hashed. A trimmed record with the old `evidence_id` is refused, and the reader loses what the fact does not cover.
- "Fix the id field so the bundle imports." The validator recomputes the hash from content, and a patched id is still a mismatch.

:::

## The table starts at 0x14 and the addend says 0x10

*Level 2 (working) · code-reading · about 8 minutes*

From a relocatable object: the symbol `grade` has `st_value 0x10`, `st_size 46`, section `.text`; `.text` has `sh_offset 0x40` and `sh_addr 0`. The relocation table holds one record at offset `0x36`, type `R_X86_64_PC32`, symbol `.rodata`, addend `0x10`, and the instruction at `0x33` is `leaq (%rip), %rcx` whose last four bytes are zero. Answer three questions: which file bytes are `grade`, what the zero bytes become, and why the addend is `0x10` when the table of return values starts at `.rodata+0x14`.

:::answer Show the answer
:::say Short answer
The file offset of a function is `sh_offset + st_value - sh_addr`, here `0x40 + 0x10`, so `grade` is the 46 bytes at file offset `0x50`, and `st_value` alone is an offset inside the section, not a place in the file. The zero bytes are the displacement field of a RIP-relative operand; the link editor writes `S + A - P` into them, the symbol value plus the addend minus the address of the field. The processor adds that field to the address of the next instruction, `0x3a`, which is four bytes past the field, so the final target is `.rodata + 0x10 + 4 = .rodata + 0x14`; the addend carries the target offset minus the four bytes between the field and the end of the instruction.
:::

**Full answer**

**Tables that point at tables**

Only the ELF header has a fixed position in the file. Every other structure is found by an offset stored in another structure: `e_shoff` names the section header table, `sh_offset` names a section's bytes, `st_value` is an offset inside the section named by `st_shndx` while `sh_addr` is zero in an object. Sizes matter as much as starts: `grade` ends at `.text` offset `0x3e`, and the two bytes `66 90` after it are a `nop` the compiler added so the next function starts on a 16-byte boundary. They belong to no symbol, a disassembler stops at `st_size`, and a byte comparison masks them.

**Three relocation outcomes**

| Type | Formula | What the link editor does |
|---|---|---|
| `R_X86_64_PC32` to a defined symbol | `S + A - P` | writes the distance and the record is gone |
| `R_X86_64_PLT32` to an undefined function | `L + A - P` | makes a PLT entry and a GOT slot when the symbol stays preemptible; when the link binds the symbol, writes the direct distance |
| `R_X86_64_64` in a position-independent image | `S + A` | keeps a relative record for the loader |

The same compensation appears on every RIP-relative operand in the fixtures: a call to `grade` carries `grade-0x4` for the same reason. The five words at `.rodata+0x14` read `1, 2, 3, 4, 4`, which is how the compiler turned the `switch` into a table of return values at `-O1`.

**The jump table at -O0 uses the same arithmetic**

In the unoptimized object every table byte is zero and the targets exist only as five records in `.rela.rodata`. Apply `S + A - P` to entry `k` at offset `4k`: the stored value is `.text + A - (.rodata + 4k)`, the code adds `.rodata` back, so the target is `.text + A - 4k`. Entry 0 is `0x91`, entry 1 is `0x8c - 4 = 0x88`, entry 2 is `0x7f`, entries 3 and 4 are both `0x76`, the shared case.

**When the section headers are gone**

A linker can remove the section header table and `e_shoff` becomes zero; a tool that walks sections sees nothing. The loader never looked at them: `PT_LOAD` maps an address to a file offset with `p_offset + (address - p_vaddr)`. A linked address is not a runtime address either, since a position-independent executable loads at a base the kernel chooses, and the file offset is the stable coordinate.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** What are the two bytes right after `grade`, and whose are they? Expected: alignment padding, a `nop`, owned by no symbol; `st_size` is the stop condition.
- **Level 3:** In the `-O0` object the jump table bytes are all zero. Where are the targets? Expected: in the five relocation records; target equals the addend minus `4k`, and the code adds the table base back.
- **Level 3:** The executable is stripped of section headers. How do you find the bytes behind an address? Expected: through the `PT_LOAD` program header, `p_offset + (address - p_vaddr)`.
- **Level 4:** A decompiler shows the table under a `DAT_` name at an absolute address. Reconcile it with `.rodata+0x14`. Expected: it placed the object at its own base and applied the relocation; subtract the base it gave `.rodata` and the offset is `0x14`.

**Wrong answers, and why they fail**

- "`grade` is at file offset `0x10`." That is `st_value`, an offset inside `.text`; the file offset adds `sh_offset`.
- "The table starts at `0x10` because the addend says so." The addend compensates for the four bytes to the end of the instruction; the target is `0x14`.
- "The instruction is `lea 0(%rip)`." The zeros are a placeholder the link editor fills; the relocation record names the operand.

:::

## nm says one function, the file has five

*Level 2 (working) · tradeoff · about 8 minutes*

A stripped arm64 executable holds five functions, and `nm` lists one name. Compare four ways to recover the function starts, score each against the unstripped twin at `-O0` and `-O2`, and say how you name the functions afterwards and where that naming collides.

:::answer Show the answer
:::say Short answer
The link editor's own table wins: `LC_FUNCTION_STARTS` is nine bytes of uleb128 deltas that list all five starts at both levels, and `strip` does not touch it. A prologue scan for the pre-indexed frame store finds 0 of 5, because the compiler emits `sub sp, sp, #N` first; a mask for that `sub` finds 5 of 5 at `-O0` and 1 of 5 at `-O2`, where four leaf functions have no frame at all. Call targets plus the entry point find 5 of 5, since a `bl` into the middle of a function is something a compiler does not emit for C. Names come from signatures built from your own objects, a 32-byte pattern with relocation bytes wildcarded and a CRC16 of the tail; at `-O2` two functions share their first 36 bytes because one inlined the other, and the tail byte at 44 and the lengths 60 against 72 split the collision.
:::

**Full answer**

**The four finders**

| Method | What it reads | `-O0` | `-O2` | Why |
|---|---|---|---|---|
| `LC_FUNCTION_STARTS` | uleb128 deltas in `__LINKEDIT` | 5 of 5 | 5 of 5 | written for the unwinder and crash reporter; survives `strip` |
| frame-store prologue | `stp x29, x30, [sp, #-0x10]!` | 0 of 5 | 0 of 5 | the compiler stores the pair at a positive offset after `sub sp` |
| `sub sp` mask | `(word & 0xff0003ff) == 0xd10003ff` | 5 of 5 | 1 of 5 | leaf functions at `-O2` allocate no frame; one starts with `cbz` |
| call targets | every `bl` inside `__text`, plus the `LC_MAIN` entry | 5 of 5 | 5 of 5 | nothing calls `main`, so the entry is added by hand |

No false positives appeared here because the program is small. One-byte patterns such as the x86-64 `push rbp` byte hit inside other instructions, which is why real pattern files pair a start pattern with a byte that must end the previous function. Prefer the tables the link editor wrote, then call targets to fill gaps, and scan for bytes last.

**What strip leaves per format**

The names the loader binds survive everywhere: imports and exports in the dynamic symbol table, the import and export directories of a PE image, the chained imports table and the exports trie of a Mach-O. Function starts survive as unwind data (`.eh_frame` unless built without unwind tables), as `.pdata` entries for non-leaf functions in a PE image, and as `LC_FUNCTION_STARTS`. The static symbol table and the debug sections go. A fully stripped library whose symbol table holds zero records still links, because the link editor reads the exports trie.

**Signatures and the collision**

A signature is the first 32 bytes of a function with every relocated byte marked variant, a CRC16 over the bytes after the pattern up to the first variant byte, and the names the function references. Built from the unstripped objects and applied at every recovered start, the signatures name all five functions at both levels. At `-O2` the two colliding functions produce identical pattern and CRC lines; the report records both candidates and the byte that decided them. A collision that nothing separates stays an unknown. The premise is checked too: every non-variant byte of each object function equals the byte at the same offset in the linked file, so the link editor changed only the relocated words.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** Why does the frame-store scan find nothing even at `-O0`? Expected: the compiler emits `sub sp` first and stores the frame record at a positive offset, so the pre-indexed form never occurs.
- **Level 3:** Why can `strip` not remove the function starts table? Expected: the unwinder and the crash reporter read it, the link editor writes it into `__LINKEDIT`, and only the symbol table is the debugger's.
- **Level 3:** Two signatures match at the same start. What do you record? Expected: both candidates, the tail byte and the lengths that split them, and an unknown when nothing does.
- **Level 4:** Which table plays this role in a PE image, and whom does it omit? Expected: `.pdata` with its `RUNTIME_FUNCTION` entries, which omit leaf functions that allocate no stack and call nothing.

**Wrong answers, and why they fail**

- "`nm` shows one function, so there is one." It shows the symbol table; the link editor's starts table lists five.
- "Scan for the standard prologue." At `-O2` four of five functions have no frame; the scan reports what the compiler chose to emit.
- "A matching CRC proves the name." Two functions shared pattern and CRC; the tail byte and the lengths decided, and the record says so.

:::

## profile_mismatch after an upgrade and a rename

*Level 2 (working) · debug · about 8 minutes*

After a tool upgrade, a call to `open_binary` with the saved snapshot answers `profile_mismatch`, although the target's SHA-256 and the provider are unchanged. The same morning a colleague renamed one function, and later `close_binary` with a snapshot path failed with "Analysis snapshots are unavailable because analysis metadata may have changed". Explain both refusals, and say what a snapshot is and is not.

:::answer Show the answer
:::say Short answer
The cache key is the string `query_` plus a SHA-256 over the target identity, the binding, the operation and the parameters, and the binding includes the analysis profile digest over 25 parameter version strings; the upgrade moved two of those values, so the digest changed and no stored entry can match, which the import reports as `profile_mismatch`. A rename is a mutating call, and the session empties the cache and sets a flag before the call is dispatched, even when the reply fails, because a failed reply cannot prove that the write never reached the provider, so the export is refused and the way out is to export the evidence bundle, close without a snapshot, and reopen. A snapshot is a file of exact past answers plus their evidence bundle, not a saved provider database.
:::

**Full answer**

**Three things called a snapshot**

The target snapshot is the private copy the launcher imports read-only and deletes on close; nothing of the analysis survives it, and every new session imports the target again. The in-memory analysis snapshot cache holds up to 10,000 entries for one target identity. The snapshot file is what `close_binary` writes and `open_binary` reads: the target identity, the provider binding, the cache entries and the session's evidence bundle. Only an exact query that qualifies can reuse a result, and a new or live query still starts the provider.

**What qualifies and what a hit looks like**

A call qualifies when its operation is not stateful, names its document or address where one is implied, declares no artifact mutation, and carries a cache policy of `snapshot`. A hit returns without touching the provider and adds one limitation: "Loaded from a local REA analysis snapshot; this call did not re-run the provider." The replayed record is rebound to the open target's path and keeps its `evidence_id`, because the path is outside the hash. The lesson's measurements make the point: a first query took 8.6 s with a fresh import, a different query against the same snapshot took 8.5 s because it was a miss, and a repeat took 2.1 s and returned the identical record with the identical id.

**Load is a full check**

Entries must be in canonical id order, every query id is recomputed and must match, no id appears twice, and every entry must have an evidence record in the bundle with the same profile and result. A bundle record for another target fails the whole file. The write is atomic and owner-only.

**Why the order of invalidation matters**

The current release invalidates and then calls the provider; an earlier release invalidated only after a successful call. The documentation states the rule: a metadata write clears the cache of the active session even when its reply fails, since the provider can already have applied the write.

**Follow-ups** (answer before you read the Expected part)

- **Level 2:** You cached `analyze_function` for one function and then asked about another. Why a miss? Expected: the parameters are part of the key, so only the exact same question replays.
- **Level 3:** Why not invalidate after the mutating call succeeds? Expected: a failed reply cannot prove rollback, so a cache kept after a failure could replay an answer about a database that changed.
- **Level 3:** How does a reader tell a replayed record from a fresh one? Expected: the added limitation sentence that says the provider did not re-run.
- **Level 4:** What is the right action after the upgrade refusal? Expected: run the analysis again under the new profile and keep the old bundle as evidence about an old contract; never edit the digest to force a match.

**Wrong answers, and why they fail**

- "A snapshot is a saved project; reopen it." It holds answers to past questions, and the project is deleted on close.
- "Patch the profile digest so the old entries match." The digest names the contract the answers were produced under; a forced match replays answers from a changed contract.
- "A rename is metadata, so cached answers stay valid." A rename is a mutating call; the cache is emptied before dispatch and the export is refused.

:::

## Every breakpoint resolved and none was hit

*Level 3 (senior) · debug · about 10 minutes*

An agent reports "main calls `bump`, `classify` and `sum_balances`". You build the program at `-O2`, set a breakpoint on each name, and run it under the debugger. The program prints its four lines and exits with status 0, and `breakpoint list` shows every breakpoint `resolved` with `hit count = 0`. Grade the agent's claim and the seven other static claims in the plan, and name the harness mistake that would have produced a transcript with no stops on a build where the calls do happen.

:::answer Show the answer
:::say Short answer
Each breakpoint resolved, so the symbol exists and a trap was written at its address; a hit count of zero after a full run with exit status 0 means no instruction fetch reached it, so for this build the call-edge claim is refuted, and only that one, because the compiler inlined all three calls and folded the sum into the constant 315. The output claim is confirmed by the four lines and the exit status, and the argument-register, field-offset, store and stride claims are not-observed, because no stop could test them, with the hit counts as the reason. The harness mistake is `--auto-continue`: such a breakpoint reports no stop and the stop hook never runs, so a first version of the harness recorded nothing even on the unoptimized build where every call happens; plain breakpoints, a stop hook and a fixed budget of `continue` commands fix it.
:::

**Full answer**

**Three verdicts and never a fourth**

A stop that tested a claim and agreed is `confirmed`; a stop that tested it and disagreed is `refuted`; a claim no stop could test is `not-observed`, with the reason. The ledger accepts the first two as observed records with authority `controlled-replay` and keeps the third as an open unknown. A resolved breakpoint never stands in for a run.

**What the refutation does and does not say**

The claim was that `main` calls the three functions in this program. For this build and this run it does not, and the harness checked that the run completed, since a hit count of zero before exit would mean only that the run had not reached the call yet. The claim did not say the functions are dead code, and the run does not say that either: `nm` still lists them because they are external and another object could call them, and the debug information for the optimized build has four subprograms and zero inlined-subroutine entries, so even it does not record the inlining. The struct still has `balance` at offset 4 in this build; no stop read memory to show it, and `not-observed` keeps that distinction.

**The unoptimized run for contrast**

The same plan on the `-O0` build produced eleven stops: hit counts 1, 3, 1 for the three names and 2, 1, 1, 1 for the four edge breakpoints placed at the target and fall-through of two conditional branches. The watchpoint on `a->balance` fired once with old value 250 and new value 255, which is one write of `by` equal to 5, and the first row of memory read at the entry stop decoded word by word against the DWARF offsets. All eight claims ended `confirmed` there.

**Two more transcript traps**

An address breakpoint set without naming the module stays `unresolved` with `hit count = 0` for the whole run, because a bare number before the process exists has no section behind it; the form that connects a listing address to a load address names the module. And the first `continue` after the process has exited ends the whole command file unless `interpreter.stop-command-source-on-error` is false, so `breakpoint list` never runs and the transcript has no hit counts to read.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why does the run refute the call edges without making the functions dead code? Expected: the claim was about this program's `main`; the functions are exported and another object could call them.
- **Level 3:** Where does the watchpoint on `a->balance` go in the optimized run? Expected: nowhere; it is set at the `bump` stop, which never happens, so the store claim is not-observed; a register-resident local would never fire either.
- **Level 4:** The transcript stops before `breakpoint list`. What happened and what changes? Expected: a `continue` after exit ended the command file; set the interpreter not to stop sourcing on error so the table prints.
- **Level 4:** Why keep the transcript and not only the verdicts? Expected: the verdicts are derived from it, anyone can re-derive them, and its header records the command line and the debugger version.

**Wrong answers, and why they fail**

- "Hit count zero means the functions are dead code." It means no fetch reached them in this run of this build; they are exported and other callers are possible.
- "`nm` lists them, so they are called." The symbol table lists exported functions; the debug information shows four subprograms and no inlined entries.
- "Use auto-continue so the transcript stays clean." An auto-continue breakpoint reports no stop and the hook never runs; the clean transcript is empty evidence.

:::

## How many cells prove two small functions equal

*Level 3 (senior) · estimate · about 10 minutes*

Design the input grid that runs an original and a rebuild of `percent_change(int before, int after)` and `grade(int score)` side by side, so that every hazard the listing shows has at least one cell. Estimate how many cells you need and in which classes, and how many cells a rebuild that kept the decompiler's `long` will fail.

:::answer Show the answer
:::say Short answer
Read the hazards off the listing: a zero guard from `TEST EDI, EDI`, truncation toward zero for negative operands, multiply-before-divide order for rounding, a 32-bit wrap from `IMUL EAX`, a divide trap when the wrapped product is `INT_MIN` and the divisor is -1, and for `grade` both sides of every band edge plus scores beyond the switch. Ten `before` values crossed with seven `after` values give 70 cells, 22 scores add the rest, 92 in all: 32 overflow, 17 negative, 14 boundary, 12 plain, 7 zero guard, 5 negative truncation, 2 beyond the switch, 2 rounding, 1 trap. The `long` rebuild fails the overflow cells with `|before| > 1`, 26 of them, and a threshold rebuild of `grade` fails the two cells beyond the switch, so the plausible pair fails 28 of 92 while all ten naive cases pass.
:::

**Full answer**

**One class per hazard**

Differential testing needs two comparable systems fed mechanically generated cases, and the hard part is evaluating the result. Here the original is the oracle, so the only question is where the two can disagree, and each class answers one such question. The zero guard cells take the early return. Negative cells check that `-9 / 10` is 0 and `-10 / 10` is -1. Rounding cells check that `(105 - 100) * 100 / 100` is 5 and not 0. Overflow cells make `(after - before) * 100` exceed 32 bits. The one trap cell makes the wrapped product equal `INT_MIN` with `before` equal to -1: the difference is 536870912, which wraps to -2147483648, and the divisor is -1.

**Why overflow is in scope**

Signed overflow is undefined in C, and a program generator that avoids undefined behaviour does so because an oracle disagreement there is noise. This oracle is a compiled object with one fixed behaviour, so the overflow cells are in scope; the lesson is to know which cells rest on the standard and which on the compiled bytes. The listing settles it: the multiply keeps the low 32 bits, and the rebuild must too.

**The host is part of the result**

On x86-64 the trap cell raises the divide error exception, because the quotient does not fit in 32 bits, and the driver turns `SIGFPE` into the value `trap`. On AArch64 `sdiv` has no trap and returns -2147483648. The recorded run on an arm64 host shows that value with `match: true`, and a run of the same grid on x86-64 records the string `trap`. The report names the architecture beside every row, and a proof without the host name is incomplete.

**Model and run stay apart**

A Python model of the listing, with a 32-bit wrap and a C-style division, predicts each cell; the run observes it. Zero disagreements means the model and the binary agree on every cell. The model is derived evidence and the run is observed evidence, and the report keeps them in separate fields rather than rounding one into the other.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why include cells whose behaviour is undefined in C? Expected: the oracle is a compiled object with one behaviour, and the listing shows the width, so the rebuild is held to the bytes and not to the standard.
- **Level 3:** Of the 32 overflow cells, how many does the `long` rebuild pass, and why? Expected: six, those with `before` of 1 or -1, because the 64-bit quotient truncates back to the wrapped value by accident.
- **Level 4:** The grid passes on an arm64 host. What stays unproven for x86-64? Expected: the trap cell, whose original result differs by architecture; rerun on x86-64 or mark it with the host.
- **Level 4:** Extend the grid to `total(const int *values, int count)`. Which classes appear? Expected: count 0, a negative count, one element, and sums that wrap at 32 bits, each with the listing instruction that motivates it.

**Wrong answers, and why they fail**

- "Ten hand-written tests cover it." They passed on both wrong rebuilds; none crossed the width or the switch bound.
- "Fuzz it instead of a grid." Random inputs find divergence but do not name the hazard; a class per instruction tells you what a failure means and what a pass covers.
- "Skip the divide-by-minus-one cell; nobody does that." It is the one cell whose result depends on the architecture, and the report must name the host.

:::

## Same 46 bytes, same relocation, wrong table

*Level 3 (senior) · design · about 10 minutes*

Design the second leg of a rebuild proof: build every candidate under the compiler and flags that produced the original, then compare it with the original function. Eight candidates are on the table, among them a pair of `percent_change` rebuilds whose source lines are written differently, a `grade` candidate whose 46 code bytes and relocation shape match the original but whose `case 10` returns 3, and candidates whose relocation addend differs from the original. Say what the compare does at each step, which candidate each step stops, and what a pass means.

:::answer Show the answer
:::say Short answer
Three steps in order: mask every relocation field by zeroing its bytes on both sides and compare the code; compare the relocation records by offset, type and target section, not by addend, because the original says `.rodata+0x10` and every candidate says `.rodata-0x4` and that is a different table position, not a different function; then read the bytes each relocation points at, here five 4-byte words, and compare them. The wrong-constant candidate passes the first two steps and fails only the third, `1, 2, 3, 4, 4` against `1, 2, 3, 4, 3`. A pass proves that this compiler with these flags produced the same code and the same referenced data from the candidate; it does not prove that the candidate is the original source text, since the two `percent_change` rebuilds with different text compile to identical 16 bytes.
:::

**Full answer**

**Where each candidate stops**

| Candidate | Size | Masked bytes | Records | Table | Status |
|---|---|---|---|---|---|
| `percent_change_mul_first` | 16 and 16 | equal | none | none | pass |
| `percent_change_split` | 16 and 16 | equal | none | none | pass |
| `percent_change_wide` | 16 and 26 | size differs | none | none | fail |
| `percent_change_div_first` | 16 and 18 | size differs | none | none | fail |
| `grade_switch` | 46 and 46 | equal | same shape | equal | pass |
| `grade_table` | 46 and 46 | equal | same shape | equal | pass |
| `grade_thresholds` | 46 and 39 | size differs | 1 against 0 | none | fail |
| `grade_case10_wrong` | 46 and 46 | equal | same shape | differ | fail |

Size is a diagnostic and never an acceptance: a recorded reconstruction project reports a candidate with the right length and hundreds of differing bytes.

**Why mask when the field is already zero**

In a RELA object the addend lives in the record and the four field bytes are zero on both sides, so a plain compare would pass while the two relocations name different places. Masking anyway keeps one method for REL objects and for Mach-O, where the field carries the addend. The addends differ because the original object holds another table in `.rodata` before the switch table and the candidate object does not.

**Why read the constants**

This step exists because of a documented bug in another reconstruction project: a comparison replayed the target address into the relocation field, compared instruction bytes, and never checked the data at that address, so a source literal of `0.0` appeared exact against a target literal of `128.0` until 1,548 floating-point references were audited. The wrong-constant candidate is this fixture's version of that defect, and the table read is the audit. The count of five comes from the listing: a compare against 4 with an unsigned jump admits indexes 0 to 4, and the load reads 4 bytes per index.

**What the tool's own compare can see**

The comparison tool line-diffs provider text on eight dimensions, and its assembly dimension carries two fixed limitations: exact provider text is compared without address or generated-name normalization, and assembly is opaque provider text with relocation normalization unavailable. An `unchanged` assembly dimension means equal text from one engine, a `changed` one means different text, and neither is a statement about bytes. Two copies of the same code at different addresses diff as changed. The byte-level proof is the part the tool leaves to you.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the addend left out when the two relocation records are matched? Expected: the addend encodes where the table sits in that object's `.rodata`, which depends on what else the object holds, not on what the function does.
- **Level 3:** What does a `changed` assembly dimension in the comparison tool tell you about the two functions' bytes? Expected: nothing; it is a text diff with addresses inside, and a relocatable object against its linked image diffs as changed.
- **Level 4:** Two candidates with different source text pass every byte check. What have you proved? Expected: that this compiler folded both to the same code and data, not that either is the original text; signed overflow being undefined lets the compiler merge the two multiplies.
- **Level 4:** A candidate passes bytes and constants. Is behaviour settled? Expected: on the same architecture yes, since code and referenced data are equal; the trap cell still depends on the host that runs the grid, so the proof names it.

**Wrong answers, and why they fail**

- "Equal size means equal function." Size is a diagnostic; a candidate with the right length can differ in hundreds of bytes.
- "A byte match recovers the source." Different source text can compile to identical bytes; the match is a statement about one compiler and one set of flags.
- "The comparison tool said unchanged, so the bytes match." It compared decompiler text with addresses inside and says so in its own limitations.

:::

## Three addresses for grade and four block counts

*Level 3 (senior) · debug · about 10 minutes*

An agent runs four tools on one relocatable object and reports that `grade` sits at `0x08000050` in one, `0x400010` in another and `0x100010` in a third, so the tools disagree about where the function is. On the `-O0` object it then reports 3, 8, 8 and 9 basic blocks for the same function. Explain both reports, and say what a block count measures.

:::answer Show the answer
:::say Short answer
The object has no load address, so each tool picks one: `0x08000000` for the file in two tools, which puts `.text` at `0x08000040`, `0x400000` in a third, `0x100000` in a fourth, and the sweep prints offsets with no base at all. Subtract each tool's `.text` address and every answer is `0x10`, which is what the symbol table says. The block counts are four answers to how far each tool followed one indirect jump and where it cut: 3 blocks is a tool that stopped at `jmp rax` and left 36 bytes unreached, 8 with 11 edges is a tool that read the five relocations behind the table and found four distinct targets, 8 with 7 edges is a tool whose case blocks exist but whose transfer at `0x62` goes to an unresolvable node, and 9 with 12 edges is a tool whose switch analysis placed a label on the jump at `0x74` and whose block model starts a new block at a label.
:::

**Full answer**

**Reduce before you compare**

The harness reads the base from each capture and compares after reduction. A disagreement on raw addresses is a disagreement about loaders, and the test that every tool places `grade` at offset `0x10` from its own base is the first thing to fix in place. Loaders also differ on relocations: one processes them on import, one applies them, and one prints a hint that relocations were not applied unless a setting says so. What a loader does with relocations decides what every later stage can see.

**Compare in order, read the notes**

Instruction starts first: in the agreement case all four tools report the same starts in every function, and the four graph builders report 3, 3, 5 and 4 blocks with identical edge sets. Then blocks, then edges, and each tool's own note before judging a count: a `switch_op` with five cases and four distinct targets, a `COMPUTED_JUMP` flow with four targets, or an unresolvable target node explains most differences. All four tools decoded the same 33 instructions once they reached them. The lesson-33 graph had 8 blocks and 11 edges, and one tool matches it exactly; the tool with 9 and 12 found the same four targets and split one block at a label.

**Where tools invent and miss**

One framework ends a block at a `call`, because its IR block is single-entry multiple-exit, so a function that calls another reports 2 blocks where the other three report 1 for the same instructions. The same framework invents functions at padding gaps with no symbol, 9 across the four objects, and one more on the trap table. The sweep decodes padding bytes that no graph builder treats as code. The harness names one missed range in one tool, the 36 case bytes of `grade`, and no missed function in any tool.

**What was run and what was read**

Two commercial tools were described from documentation only and are marked as not run in the figure and the table. A description is useful evidence of a different kind from a capture, and the report says which is which. Every capture is stored with its command, version and date; a disagreement you cannot re-read is not a finding.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** One tool reports 9 blocks and 12 edges, another 8 and 11, for the same control flow. Who is wrong? Expected: neither; a label on the indirect jump started a new block, and both found the same four computed targets.
- **Level 3:** On the caller of `grade`, one tool reports two blocks and the rest one. Explain. Expected: that tool's IR block ends at a call; the instruction set is the same.
- **Level 4:** One listing shows the four case blocks as dead code. How do you classify those bytes? Expected: missed by a stopped walk, since three tools reach them through the table; the byte accounting names the range and the tool.
- **Level 4:** You could not run two commercial tools. How do they appear in the report? Expected: from their documentation, marked as not run, with no measured number attributed to them.

**Wrong answers, and why they fail**

- "The tool with the most blocks found the most code." The extra block is a label split; all four decoded the same instructions where they reached them.
- "Compare the raw addresses; the tools disagree." The object is relocatable, and each tool chose a base; the offset agrees.
- "The sweep tool is broken because it prints `0x10`." It prints section offsets with no base, which is the correct answer with the base removed.

:::

## A proof record that stays unknown without a compiler

*Level 4 (staff) · design · about 15 minutes*

Design the proof record for a rebuilt function that an obligation ledger will accept. The analysis tool's own verifier grades declared claims against comparison records, and its fixed limitation reads "Pass means every declared claim passed; it does not establish global implementation equivalence"; its readiness rule says that nothing weaker than pass adds up to pass. Your CI host has no C compiler. Say what your record contains, how its id is formed, which claims it can and cannot carry from the tool, and what status it gets on that host.

:::answer Show the answer
:::say Short answer
Mint one evidence record of your own, since no public tool emits it, and give it `predicate_type: rea.reconstruction-proof`, `operation: verify_reconstruction_obligations`, `confidence: observed`, `authority: controlled-replay`, and a `normalized_result` with `passed`, `status` and a list of claims, each `behavioral` or `structural-function` with its status and the `ev_` ids of the function dossiers it rests on, repeated in `evidence_links`. The id is `ev_` plus the SHA-256 of the record without its id over sorted-key compact JSON. Aggregation is fail-closed: `fail` wins, then `unknown`, and an empty claim list is `unknown`. The tool's verifier can only grade a `structural-function` claim as same provider text on one dimension, so behaviour and bytes come from your own two legs; on a host without a compiler the behavioural claims are `unknown`, and the record says `unknown` even when both byte claims pass.
:::

**Full answer**

**Why the tool's pass is not enough**

A `structural-function` claim names one of nine dimensions of a `compare_functions` record, and the verifier computes its status in a fixed order: any limitation makes it `unknown`, an observed `changed` makes it `fail`, an observed `unknown` or an open residual unknown makes it `unknown`, otherwise `pass`. The recorded run sent four claims and got two passes and two failures. The `total` claims failed although both builds came from one source line, because `-O2` unrolled the loop into 62 instructions where `-O1` had 13; different text does not mean different behaviour. The reverse holds too: a rebuild with a wrong constant in a lookup table prints the same assembly text, so a text claim can pass on a wrong function. Nothing in the tool runs a function or compiles one.

**The two legs you run**

Leg one compiles the original and the candidate into one program under different names, runs a grid with one class per hazard, and records every cell, including a trap. Leg two recompiles the candidate with the original flags, masks the relocation fields, compares the relocation records by shape, and reads the constants they point at. Each leg produces one claim per function, and each claim links the dossier records of the function it covers. The behavioural claim without a compiler is `unknown`, not skipped and not passed.

**Authority and id**

`authority` is `controlled-replay`, because the proof comes from a harness you ran and not from the object file alone; `shipped-artifact` would claim that the file by itself supports equality, which it does not. The id excludes nothing but itself: adding a claim or a run changes the content and the id, so a proof produced later on a host with a compiler is a new record, and both are kept. No public tool emits this record; the obligation ledger expects it, and you mint it.

**Driving the verifier at all**

The tool's verifier is one of 65 MCP tools without a CLI command, so a stdio client sends `initialize`, the initialized notification and `tools/call`. Both dossiers and the comparison record must be in the same connection, because the verifier reads the connection's bundle, and a close clears the retained records; export the bundle before you close.

**The readiness rule, copied**

A stage result of fail, unknown, unsupported, truncated or skipped never adds up to pass. That sentence is the aggregation function.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why is the authority `controlled-replay` and not `shipped-artifact`? Expected: the fact came from a run and a recompile you controlled; the file alone cannot show that two functions are equal.
- **Level 4:** The verifier passed both `percent_change` claims while the comparison's overall status was `unknown`. How? Expected: each claim reads its own dimension; the unknown dimension was `references`, and the residual unknown it opened names only `overall` and `references`.
- **Level 4:** A compiler appears on the CI host next week. What happens to the record? Expected: the behavioural claims rerun and pass, the content changes, so a new id is minted, and the earlier `unknown` record is kept as history.

**Wrong answers, and why they fail**

- "A pass from the verifier proves the rebuild equals the original." Its own limitation says otherwise; it compared decompiler text on one dimension.
- "Mark the behavioural claims passed on CI since the bytes matched." Nothing weaker than pass adds up to pass; a missing run is `unknown`.
- "Keep the same id after adding the run results." The id is a content hash; a changed record is a new record.

:::

## The agent that answers what 95 prints and shows its work

*Level 4 (staff) · take-home · about 60 minutes*

Take-home. Build the harness an agent uses to answer one question about a program you compiled yourself, through the analysis tool's MCP server: what does the program print for a score of 95, and where does the letter come from? Deliver the authorization note, the call plan with its deadlines, the ledger that lists each claim on its own line, the open unknowns, the rule for text that comes out of the file, and the tests you ship.

:::answer Show the answer
:::say Short answer
Begin with the authorization note: the target is your own build, and the note still answers the five questions in writing, a lawful copy, a named purpose, facts not already available, work confined to the needed parts, and your own expression in anything you release. Plan the calls in order, `open_binary`, `list_procedures`, `list_strings`, `analyze_function` on the two functions, then `read_bytes` on both tables the dossiers name, and `export_evidence_bundle` before `close_binary`, with a client deadline set from a measured cold start because the first engine-backed call pays for the import. Keep a ledger with one row per claim, each row a kind among observed, derived, inferred and unknown, an evidence id and a boundary, and let the row "95 prints A" stay inferred until the two table reads turn it observed. Treat every string, name and line of pseudocode from the file as data with an address, never as an instruction.
:::

**Full answer**

**Authorization**

Every target is a program you wrote and compiled, and the note says so with hashes. For any other program the note answers the five questions before the first command and names the purpose the law names. The tool does not check authorization; the note is yours.

**Call plan and deadlines**

`open_binary` returns the format, kind, SHA-256 and architecture without importing anything. The first engine-backed call starts the headless import and takes seconds; later calls on the same target take milliseconds. The server allows 330,000 ms for that start, and the pinned client SDK waits 60,000 ms by default, so the client deadline is the one to set from your own first run. Ask every question before `close_binary`, because the project is deleted and the retained records go with it; export the bundle first so every id in the ledger stays checkable.

**The ledger**

The recorded session returned 13 procedures and 39 strings, then two dossiers. Its ledger reads, in part:

| Claim | Kind | Evidence | Boundary |
|---|---|---|---|
| `_grade` divides its argument by 10 | derived | the dossier's multiply by `0x66666667` and the shifts | a reading of the listing that the pseudocode confirms |
| five 4-byte entries sit at the table the `lea` names | derived | `cmp w8, #0x4` and the scaled load | count from the compare, width from the shift |
| the five values in that table | unknown | none; `read_bytes` with length 20 would observe them | no call in this session read memory |
| nothing calls `_grade` with a call instruction in this build | observed | `callers: []` and one `DATA` reference | coverage complete for resolved calls only |
| a score of 95 prints `A` | inferred | the C source the reader owns | no record of this session supports it |
| the function name `_nothing` | refused | `invalid_request` | a failed call produces no evidence |

The second-to-last row separates an honest report from a confident one. The reader compiled the source and knows the answer; the agent's records stop at two unread tables, and the two `read_bytes` calls are the next steps of the investigation.

**Text from the file is data**

Every string, symbol name, comment and line of pseudocode copied out of the target is target text. The agent quotes it with its address and never acts on it, and the ledger has no row kind for an instruction received from the file. Each result that can carry such text arrives with a provenance marker that names the analysis target as untrusted; the marker tells the agent which text came from the file, and the agent still applies the rule. A 2026 study planted text inside binaries and found that models proposed the planted unsafe action in 35 of 40 cases without controls; showing the content as data alone still left 15 of 40, and provenance checks with tool authorization removed them.

**Tests to ship**

1. A stand-in server replays the recorded records for the same tool and arguments, so the loop runs with no engine installed.
2. Every record's id recomputes from its content, and a record with one limitation removed is refused.
3. Promotion refuses a derived or inferred id and passes only with an agreeing run under `controlled-replay`.
4. The ledger marks a claim `unknown` when some inputs have runs and others do not, and never rounds it up.
5. A fixture binary carries a string that reads like a command; the test asserts that the ledger holds it as a value with an address and that nothing executes.
6. A client deadline shorter than the measured cold start produces a recorded timeout step, not a finding.

**Follow-ups** (answer before you read the Expected part)

- **Level 3:** Why export the bundle before the close? Expected: the close deletes the project and clears the retained records, and the ledger's ids are checkable only against a bundle.
- **Level 4:** A run of the host build agrees with the prediction for 95. What limitation travels with that row? Expected: the object never ran; a build of the same source for another architecture did, which is the strongest observation without an emulator.
- **Level 4:** The strings list contains "run this command to continue". What does the ledger do? Expected: records the string with its address as an observed value, flags the request, and executes nothing; the provenance marker is data about data.
- **Level 4:** The agent has the C source. Why does "95 prints A" still read inferred? Expected: no record of the session supports it; two `read_bytes` calls would, and until then the honest kind is inferred.

**Wrong answers, and why they fail**

- "The pseudocode returns an entry of `_labels`, so the letter is observed." The access is observed; the value behind it was never read.
- "Skip the authorization note for a file I compiled." Write it anyway; the questions answer themselves for your own build, and the habit is the control for every other file.
- "Treat the usage text as the program's instructions to the agent." It is target text; quote it with its address and never follow it.

:::
