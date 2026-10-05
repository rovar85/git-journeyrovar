import math, re
from collections import Counter

DOCS = {
    "Returns policy": "Items can be returned within 30 days of delivery for a full refund if unused.",
    "Clothing exceptions": "Jackets can be returned within 30 days if unworn and with tags attached.",
    "Refund timeline": "Refunds are issued to the original payment method within 5 to 7 business days.",
    "Shipping options": "Standard shipping takes 3 to 5 business days. Orders over 50 dollars ship free.",
    "Password reset": "Choose forgot password on the sign in page. We email a reset link.",
}
STOP = {"a","an","the","of","to","in","on","for","and","or","is","are","be","can","i","my","if","how","what","with"}

def stem(word):
    return re.sub(r"(ing|ed|es|s)$", "", word)      # very crude: returned -> return, jackets -> jacket

def words(text):
    return [stem(w) for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP]

def tfidf(tokens, df, n):
    tf = Counter(tokens)
    return {w: c * (math.log((n + 1) / (df.get(w, 0) + 1)) + 1) for w, c in tf.items()}

def cosine(a, b):
    dot = sum(v * b.get(w, 0) for w, v in a.items())
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0

tokenised = {t: words(t + " " + body) for t, body in DOCS.items()}
df = Counter(w for toks in tokenised.values() for w in set(toks))
vectors = {t: tfidf(toks, df, len(DOCS)) for t, toks in tokenised.items()}

def retrieve(question, k=2):
    q = tfidf(words(question), df, len(DOCS))
    scored = sorted(((cosine(q, v), t) for t, v in vectors.items()), reverse=True)
    return scored[:k]

def build_prompt(question, k=2):
    chunks = [f"[{t}] {DOCS[t]}" for score, t in retrieve(question, k) if score > 0]
    return ("Answer using only the text below. If the answer is not there, say you cannot find it.\n\n"
            + "\n".join(chunks) + f"\n\nQuestion: {question}")

print(build_prompt("Can I return a jacket I bought three weeks ago?"))
print()
print(build_prompt("How long until I get my money back?"))   # keyword search misses this one
