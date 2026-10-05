"""The smallest useful agent, with a pretend language model so it runs offline.

Everything an agent needs is here: a loop, tools, a to-do list for planning, a
check for "are we done?", a step limit, and a trace. The only fake part is
MockLLM, a rule-based stand-in that behaves like a model asking for tools.
To use a real model, replace MockLLM.chat() with a call to your provider's API.
"""
import ast
import json
import operator

# ---------------------------------------------------------------- tools
TODO = {"pending": [], "done": []}

def add_todo(tasks):
    for t in tasks:
        if t not in TODO["pending"]:
            TODO["pending"].append(t)
    return {"pending": list(TODO["pending"])}

def complete_todo(task):
    if task in TODO["pending"]:
        TODO["pending"].remove(task)
        TODO["done"].append(task)
    return {"pending": list(TODO["pending"]), "done": list(TODO["done"])}

def list_todo():
    return {"pending": list(TODO["pending"]), "done": list(TODO["done"])}

FAKE_WEB = {
    "activity": "Evening kayak tour on the lake: $25 per person, 6:30 pm.",
    "restaurant": "Harbour Kitchen: set dinner $40 per person, open until 11 pm.",
}

def search(query):
    for key, text in FAKE_WEB.items():
        if key in query.lower():
            return {"query": query, "result": text}
    return {"query": query, "result": "no results"}

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}

def calculator(expression):
    """Safe arithmetic: only numbers and + - * / are allowed (never use eval on model output)."""
    def walk(node):
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](walk(node.left), walk(node.right))
        raise ValueError("unsupported expression")
    return {"expression": expression, "value": walk(ast.parse(expression, mode="eval"))}

TOOLS = {"add_todo": add_todo, "complete_todo": complete_todo, "list_todo": list_todo,
         "search": search, "calculator": calculator}

# ---------------------------------------------------------------- pretend model
class MockLLM:
    """Looks at the conversation so far and decides what to do next, like a model would."""

    def chat(self, messages):
        tool_msgs = [m for m in messages if m["role"] == "tool"]
        called = [m["name"] for m in tool_msgs]

        if "add_todo" not in called:                      # 1) plan first
            return {"tool_calls": [("add_todo", {"tasks": [
                "find an activity", "find a restaurant", "work out the total for two"]})]}
        if "search" not in called:                        # 2) two independent searches in one turn
            return {"tool_calls": [("search", {"query": "evening activity"}),
                                   ("search", {"query": "restaurant for dinner"})]}
        if "calculator" not in called:                    # 3) arithmetic belongs to a tool, not the model
            return {"tool_calls": [("calculator", {"expression": "(25 + 40) * 2"})]}

        # 4) tick off every task on the to-do list (read the latest to-do result from the conversation)
        todo_msgs = [m for m in tool_msgs if m["name"] in ("add_todo", "complete_todo", "list_todo")]
        pending = json.loads(todo_msgs[-1]["content"])["pending"]
        if pending:
            return {"tool_calls": [("complete_todo", {"task": pending[0]})]}

        # 5) everything is done: write the final answer
        total = json.loads([m for m in tool_msgs if m["name"] == "calculator"][-1]["content"])["value"]
        return {"content": "Plan: kayak tour (6:30 pm), then dinner at Harbour Kitchen. "
                           f"Estimated total for two people: ${total:g}."}

# ---------------------------------------------------------------- the judge ("are we done?")
def is_done(goal, answer):
    """A tiny stand-in for an LLM-as-judge: does the answer look complete?"""
    return "total" in answer.lower() and "$" in answer

# ---------------------------------------------------------------- the loop
def run_agent(goal, llm, max_steps=12):
    messages = [{"role": "system", "content": "You are a helpful assistant. Always plan with the to-do list first."},
                {"role": "user", "content": goal}]
    for step in range(1, max_steps + 1):             # a step limit is your safety net
        reply = llm.chat(messages)
        if "tool_calls" in reply:
            for name, args in reply["tool_calls"]:   # parallel tool calls: run each, send each result back
                try:
                    result = json.dumps(TOOLS[name](**args))
                except Exception as err:             # errors go back to the model as data
                    result = json.dumps({"error": str(err)})
                print(f"[step {step}] {name}({json.dumps(args)}) -> {result}")
                messages.append({"role": "tool", "name": name, "content": result})
            continue
        answer = reply["content"]
        if is_done(goal, answer):
            print(f"[step {step}] final answer accepted by the judge")
            return answer
        messages.append({"role": "user", "content": "That is not complete. Please finish the task."})
    return "Stopped: step limit reached."

if __name__ == "__main__":
    print(run_agent("Plan a Saturday evening for two: one activity, one dinner, and the total cost.", MockLLM()))
