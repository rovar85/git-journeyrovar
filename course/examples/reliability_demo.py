"""Capability versus reliability, by simulation (standard library only).

An "agent" succeeds on each attempt with probability p. We run each task several
times and report two numbers:
  pass@k : at least one of k attempts succeeded  (capability: "can it ever do it?")
  pass^k : all k attempts succeeded              (reliability: "does it do it every time?")
"""
import random

def evaluate(p, tasks=2000, trials=5, seed=1):
    rng = random.Random(seed)
    any_ok = all_ok = 0
    for _ in range(tasks):
        results = [rng.random() < p for _ in range(trials)]
        any_ok += any(results)
        all_ok += all(results)
    return any_ok / tasks, all_ok / tasks

print(f"{'per-try p':>10} {'pass@5':>8} {'pass^5':>8}   theory: 1-(1-p)^5  and  p^5")
for p in (0.6, 0.8, 0.95, 0.99):
    cap, rel = evaluate(p)
    print(f"{p:>10.2f} {cap:>8.3f} {rel:>8.3f}   {1-(1-p)**5:>8.3f}  {p**5:>8.3f}")

print("\nAn assistant that is right 80% of the time looks capable (pass@5 near 100%)")
print("but completes 5 tasks in a row only about a third of the time.")
