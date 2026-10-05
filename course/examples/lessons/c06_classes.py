# Lesson C6: a class bundles data and the things you can do with it. Agent state.
class Investigation:
    def __init__(self, goal):
        self.goal = goal
        self.evidence = []
        self.hypothesis = "none yet"

    def add_evidence(self, fact, new_hypothesis=None):
        self.evidence.append(fact)
        if new_hypothesis:
            self.hypothesis = new_hypothesis

    def report(self):
        lines = [f"Goal: {self.goal}"]
        for number, fact in enumerate(self.evidence, start=1):
            lines.append(f"  {number}. {fact}")
        lines.append(f"Hypothesis: {self.hypothesis}")
        return "\n".join(lines)

case = Investigation("Why is indexing down?")
case.add_evidence("Indexing service is Stopped", "the service stopped")
case.add_evidence("Event log: SQL timeout at 09:12", "SQL connection problem")
print(case.report())
