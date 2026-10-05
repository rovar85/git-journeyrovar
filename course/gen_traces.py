#!/usr/bin/env python3
"""Run each lesson program under a tracer and record every step.

For each examples/lessons/*.py it records, before each line executes: which line is next,
the variables in scope, and the output printed so far. The course page replays this so a
reader can step through the program without running anything. (Real runs, not mock-ups.)
"""
import contextlib, glob, io, json, os, sys, types

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_STEPS = 220

def short(v):
    if isinstance(v, dict) and any(isinstance(x, types.FunctionType) for x in v.values()):
        return "{" + ", ".join(repr(k) for k in v) + "}  (tool functions)"
    if hasattr(v, "__dict__") and not isinstance(v, type):
        inner = ", ".join(f"{k}={short(x)}" for k, x in vars(v).items())
        return f"{type(v).__name__}({inner})"
    r = repr(v)
    return r if len(r) <= 90 else r[:87] + "..."

def trace_file(path):
    code = open(path, encoding="utf-8").read()
    steps, out = [], io.StringIO()

    def snapshot(frame):
        scope = frame.f_globals if frame.f_code.co_name == "<module>" else frame.f_locals
        rows = []
        for k, v in scope.items():
            if k.startswith("__") or isinstance(v, (types.ModuleType, types.FunctionType, type)):
                continue
            rows.append([k, short(v)])
        return rows

    def local_tracer(frame, event, arg):
        if event == "line" and len(steps) < MAX_STEPS:
            steps.append({"l": frame.f_lineno, "f": "main" if frame.f_code.co_name == "<module>" else frame.f_code.co_name + "()",
                          "v": snapshot(frame), "o": out.getvalue()})
        return local_tracer

    def global_tracer(frame, event, arg):
        return local_tracer if frame.f_code.co_filename == path else None

    env = {"__name__": "__main__"}
    sys.settrace(global_tracer)
    try:
        with contextlib.redirect_stdout(out):
            exec(compile(code, path, "exec"), env)
    finally:
        sys.settrace(None)
    final = [[k, short(v)] for k, v in env.items()
             if not k.startswith("__") and not isinstance(v, (types.ModuleType, types.FunctionType, type))]
    steps.append({"l": None, "f": "main", "v": final, "o": out.getvalue()})
    return {"code": code.rstrip("\n").split("\n"), "steps": steps}

def main():
    traces = {}
    for p in sorted(glob.glob(os.path.join(HERE, "examples", "lessons", "c*.py"))):
        key = os.path.basename(p).split("_")[0]          # c01, c02, ...
        traces[key] = trace_file(p)
        print(key, len(traces[key]["steps"]), "steps")
    return traces

if __name__ == "__main__":
    json.dump(main(), open(os.path.join(HERE, "src", "traces.json"), "w"))
