"""A tiny language model in pure Python (standard library only).

It counts which word follows which word in a small text (a "bigram" model),
then samples new text one word at a time, exactly like the next-word loop in
Chapter 1, just with a lookup table instead of a neural network.
"""
import random
from collections import defaultdict, Counter

TEXT = """
the students opened their books and the teacher opened the lesson .
the students opened their laptops and the teacher wrote on the board .
the teacher asked the students to read the chapter and the students began to read .
the students wrote their notes and the teacher closed the lesson .
"""

words = TEXT.split()

# 1) "Training": count what follows each word.
follows = defaultdict(Counter)
for current, nxt in zip(words, words[1:]):
    follows[current][nxt] += 1

# 2) Look at the learned probabilities for one word.
total = sum(follows["students"].values())
print("After 'students':")
for word, n in follows["students"].most_common():
    print(f"  {word:<8} {n}/{total} = {n/total:.2f}")

# 3) "Generation": sample the next word, append it, repeat.
def generate(start="the", length=12, seed=None):
    rng = random.Random(seed)
    out = [start]
    for _ in range(length):
        options = follows.get(out[-1])
        if not options:
            break
        choices, weights = zip(*options.items())
        out.append(rng.choices(choices, weights=weights)[0])
    return " ".join(out)

print()
for s in range(3):
    print(generate(seed=s))
