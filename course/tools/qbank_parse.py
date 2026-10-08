"""Parse the DevOps Interview Question Bank (CC BY 4.0, Priyanka Gupta) into structured questions."""
import re, os, glob, json

SRC = os.environ.get("QBANK_SRC", "/home/user/devops-interview-question-bank/questions")
TOPICS = {
 "01": ("linux", "Linux, shell and networking"), "02": ("docker", "Docker and containers"), "03": ("kubernetes", "Kubernetes"),
 "04": ("cicd", "CI/CD, Jenkins, Git, GitOps and Ansible"), "05": ("terraform", "Terraform and Infrastructure as Code"),
 "06": ("aws", "AWS"), "07": ("gcpazure", "GCP, Azure and DevSecOps"), "08": ("sre", "Monitoring, observability, SRE and scale design"),
 "09": ("behavioral", "Behavioral and project experience"), "10": ("scripts", "Shell scripting: 24 real interview scripts")}

def parse_file(path):
    topic = os.path.basename(path)[:2]
    lines = open(path, encoding="utf-8").read().split("\n")
    qs, cur, level, infence = [], None, "Basic", False
    for ln in lines:
        if ln.startswith("```"): infence = not infence
        if not infence:
            m = re.match(r"^## (Basic|Advanced|Scenario[- ]Based|Scenario)\b", ln)
            if m: level = "Scenario" if m.group(1).startswith("Scen") else m.group(1); continue
            m = re.match(r"^### Q(\d+)\. (.*)$", ln)
            if m:
                cur = {"topic": topic, "n": int(m.group(1)), "title": m.group(2).strip(), "level": level, "raw": []}; qs.append(cur); continue
            if ln.startswith("## ") and cur is not None: cur = None; continue
        if cur is not None: cur["raw"].append(ln)
    for q in qs:
        raw = "\n".join(q["raw"]).strip("\n")
        raw = re.sub(r"\n---\s*$", "", raw).strip()
        q["body_raw"] = raw
        m = re.search(r"^Also asked as:\s*(.*)$", raw, re.M)
        q["also"] = m.group(1).strip() if m else ""
        m = re.search(r"^> \*\*In simple words:\*\*\s*(.*?)(?=\n\n|\Z)", raw, re.M | re.S)
        q["simple"] = re.sub(r"\n> ?", " ", m.group(1)).strip() if m else ""
        m = re.search(r"^> \*\*What to say to the interviewer:\*\*\s*(.*?)(?=\n\n|\Z)", raw, re.M | re.S)
        q["say"] = re.sub(r"\n> ?", " ", m.group(1)).strip() if m else ""
        del q["raw"]
    return qs

def parse_all():
    out = []
    for p in sorted(glob.glob(os.path.join(SRC, "[0-9][0-9]-*.md"))): out += parse_file(p)
    return out

if __name__ == "__main__":
    qs = parse_all()
    print(len(qs), "questions")
    print("missing simple:", sum(1 for q in qs if not q["simple"]), "missing say:", sum(1 for q in qs if not q["say"]))
    for q in qs:
        if not q["say"] or not q["simple"]: print(q["topic"], q["n"], q["title"][:70], bool(q["simple"]), bool(q["say"]))
