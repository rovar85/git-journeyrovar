mkdir -p ~/lab/dsa && cd ~/lab/dsa
cat > ds.py <<'PYEOF'
# Node types used by the linked-list and tree problems.
class Node:                                    # one item of a singly linked list
    def __init__(self, val, next=None):
        self.val, self.next = val, next
    def __repr__(self): return f"Node({self.val})"

class Tree:                                    # one node of a binary tree
    def __init__(self, val, left=None, right=None):
        self.val, self.left, self.right = val, left, right
    def __repr__(self): return f"Tree({self.val})"

def build_list(values, pos=-1):
    """[1, 2, 3] -> 1 -> 2 -> 3. With pos >= 0 the last node links back to node number pos (a cycle)."""
    nodes = [Node(v) for v in values]
    for a, b in zip(nodes, nodes[1:]): a.next = b
    if nodes and pos >= 0: nodes[-1].next = nodes[pos]
    return nodes[0] if nodes else None

def to_list(head, limit=100000):
    out = []
    while head is not None and len(out) < limit:
        out.append(head.val); head = head.next
    return out

def build_tree(values):
    """Level-order list, None for a missing child: [3, 9, 20, None, None, 15, 7]."""
    if not values or values[0] is None: return None
    root = Tree(values[0]); queue = [root]; i = 1
    while queue and i < len(values):
        node = queue.pop(0)
        if i < len(values) and values[i] is not None: node.left = Tree(values[i]); queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None: node.right = Tree(values[i]); queue.append(node.right)
        i += 1
    return root
PYEOF
cat > check.py <<'PYEOF'
# Check your solution to a practice problem:   python3 check.py 2.1 my.py
# Your file must define a function called solve. The checker runs the test cases, then (for some problems) a large
# input to see whether the solution is fast enough. It never needs the internet.
import copy, hashlib, importlib.util, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "check.py")))
sys.path.insert(0, HERE)
from ds import build_list, to_list, build_tree
if len(sys.argv) < 3: sys.exit("usage: python3 check.py PROBLEM FILE.py   for example: python3 check.py 2.1 my.py")
pid, path = sys.argv[1], sys.argv[2]
tests = json.load(open(os.path.join(HERE, "tests.json")))
if pid not in tests: sys.exit(f"no problem called {pid}. Problems: {', '.join(tests)}")
T = tests[pid]
def fail(msg):
    print(msg); sys.exit(1)

seed = [1]
def rnd(n):                                    # a tiny fixed random generator, the same on every machine
    seed[0] = (seed[0] * 1103515245 + 12345) % 2147483648
    return seed[0] % n
def make_big(spec, n):
    seed[0] = 12345; k = spec["kind"]
    if k == "ints": return ([spec["lo"] + rnd(spec["hi"] - spec["lo"] + 1) for _ in range(n)],)
    if k == "ints_k": return ([spec["lo"] + rnd(spec["hi"] - spec["lo"] + 1) for _ in range(n)], min(spec["k"], n))
    if k == "text": return ("".join("abcdefghijklmnopqrstuvwxyz"[rnd(26)] for _ in range(n)),)
    if k == "perm":
        v = list(range(n))
        for i in range(n - 1, 0, -1): j = rnd(i + 1); v[i], v[j] = v[j], v[i]
        return (v,)
    if k == "two_sum":                         # multiples of 4, plus two numbers that are 1 more than a multiple of 4: exactly one pair hits the target
        v = [4 * rnd(1000000) for _ in range(n)]; i, j = n - 2, n // 3
        v[j], v[i] = 4 * rnd(1000) + 1, 4 * rnd(1000) + 1
        return (v, v[i] + v[j])
    raise ValueError(k)

def convert_in(args):
    c = T.get("conv")
    if c == "list_in": return (build_list(args[0]),) + tuple(args[1:])
    if c == "cycle_in": return (build_list(args[0], args[1]),)
    if c == "tree_in": return (build_tree(args[0]),) + tuple(args[1:])
    if c == "bad_version":
        n, first = args; calls = [0]
        def is_bad(v):
            calls[0] += 1
            if calls[0] > 100: raise RuntimeError("is_bad was called more than 100 times: use binary search")
            return v >= first
        return (n, is_bad)
    return tuple(args)
def convert_out(v):
    if T.get("out") == "list_out": return to_list(v)
    return v
def norm(v):
    n = T.get("norm")
    if n == "groups": return sorted(sorted(g) for g in v)
    if n == "sets": return sorted(sorted(g) for g in v)
    if n == "sorted": return sorted(v)
    if isinstance(v, tuple): return list(v)
    return v
def valid_topo(args, got):
    n, deps = args
    if not isinstance(got, list): return False
    if T["want_cycle"][json.dumps(args)]: return got == []
    if sorted(got) != list(range(n)): return False
    pos = {t: i for i, t in enumerate(got)}
    return all(pos[b] < pos[a] for a, b in deps)

spec = importlib.util.spec_from_file_location("student", path)
mod = importlib.util.module_from_spec(spec)
try: spec.loader.exec_module(mod)
except Exception as e: fail(f"NOT YET  {pid}: your file does not run: {type(e).__name__}: {e}")
if not hasattr(mod, "solve"): fail(f"NOT YET  {pid}: your file has no function called solve")
show = lambda a: (repr(a)[:120] + ("..." if len(repr(a)) > 120 else ""))
for k, case in enumerate(T["cases"], 1):
    args = copy.deepcopy(case["args"])
    try: got = convert_out(mod.solve(*convert_in(copy.deepcopy(args))))
    except Exception as e: fail(f"NOT YET  {pid}: test {k} raised {type(e).__name__}: {e}\n   input: {show(args)}")
    ok = valid_topo(args, got) if T.get("norm") == "topo" else json.loads(json.dumps(norm(got), default=str)) == norm(case["want"])
    if not ok:
        fail(f"NOT YET  {pid}: test {k} of {len(T['cases'])} failed\n   input:    {show(args)}\n   expected: {show(case['want']) if T.get('norm') != 'topo' else 'any valid order'}\n   you gave: {show(got)}")
print(f"ok   {len(T['cases'])} of {len(T['cases'])} tests correct")
big = T.get("big")
if not big: print(f"PASS {pid}"); sys.exit()
n = big["n"]; budget = 2.0
for size in (n // 64, n // 16, n // 4, n):     # grow the input; stop early if it is clearly too slow
    args = make_big(big, size); t0 = time.perf_counter()
    got = mod.solve(*copy.deepcopy(args)); took = time.perf_counter() - t0
    if size < n and took > budget / 8:
        est = took * (n / size) ** 2
        fail(f"NOT YET  {pid}: correct, but too slow: {took:.2f} s for {size:,} items, so roughly {est:.0f} s for {n:,} if it grows like n squared. Look for an O(n) or O(n log n) approach.")
h = hashlib.sha256(json.dumps(norm(got), default=str).encode()).hexdigest()[:16]
if h != big["h"]: fail(f"NOT YET  {pid}: the small tests pass but the large input ({n:,} items) gives a wrong answer")
print(f"ok   large input of {n:,} items in {took:.2f} s")
print(f"PASS {pid}")
PYEOF
cat > tests.json <<'PYEOF'
{"1.1":{"cases":[{"args":[[3,1,4]],"want":8},{"args":[[]],"want":0},{"args":[[-5,5]],"want":0},{"args":[[10]],"want":10}],"conv":null,"out":null,"norm":null},"1.2":{"cases":[{"args":[[1,2,3,1]],"want":true},{"args":[[1,2,3,4]],"want":false},{"args":[[]],"want":false},{"args":[[7,7]],"want":true}],"conv":null,"out":null,"norm":null,"big":{"kind":"perm","n":200000,"h":"fcbcf165908dd18a"}},"2.1":{"cases":[{"args":[[2,7,11,15],9],"want":[0,1]},{"args":[[3,2,4],6],"want":[1,2]},{"args":[[3,3],6],"want":[0,1]},{"args":[[-1,-2,-3,-4,-5],-8],"want":[2,4]},{"args":[[0,4,3,0],0],"want":[0,3]}],"conv":null,"out":null,"norm":null,"big":{"kind":"two_sum","n":60000,"h":"72a62639420f75e9"}},"2.2":{"cases":[{"args":["Never odd or even."],"want":true},{"args":["race a car"],"want":false},{"args":[""],"want":true},{"args":["a."],"want":true},{"args":["0P"],"want":false},{"args":["Madam, I'm Adam"],"want":true}],"conv":null,"out":null,"norm":null},"2.3":{"cases":[{"args":[[7,1,5,3,6,4]],"want":5},{"args":[[7,6,4,3,1]],"want":0},{"args":[[1]],"want":0},{"args":[[2,4,1]],"want":2},{"args":[[3,3,5,0,0,3,1,4]],"want":4}],"conv":null,"out":null,"norm":null,"big":{"kind":"ints","n":200000,"lo":1,"hi":10000,"h":"888df25ae3577242"}},"2.4":{"cases":[{"args":[[0,1,0,3,12]],"want":[1,3,12,0,0]},{"args":[[0]],"want":[0]},{"args":[[1,2,3]],"want":[1,2,3]},{"args":[[0,0,1]],"want":[1,0,0]},{"args":[[4,0,5,0,0,6]],"want":[4,5,6,0,0,0]}],"conv":null,"out":null,"norm":null},"2.5":{"cases":[{"args":[[3,1,4,1,5],[[0,2],[1,4],[3,3]]],"want":[8,11,1]},{"args":[[5],[[0,0]]],"want":[5]},{"args":[[-1,2,-3,4],[[0,3],[1,2]]],"want":[2,-1]}],"conv":null,"out":null,"norm":null},"2.6":{"cases":[{"args":[[1,2,3,4]],"want":[24,12,8,6]},{"args":[[-1,1,0,-3,3]],"want":[0,0,9,0,0]},{"args":[[2,3]],"want":[3,2]},{"args":[[0,0,2]],"want":[0,0,0]}],"conv":null,"out":null,"norm":null},"3.1":{"cases":[{"args":["listen","silent"],"want":true},{"args":["rat","car"],"want":false},{"args":["",""],"want":true},{"args":["aab","abb"],"want":false},{"args":["anagram","nagaram"],"want":true}],"conv":null,"out":null,"norm":null},"3.2":{"cases":[{"args":["swiss"],"want":1},{"args":["aabb"],"want":-1},{"args":["x"],"want":0},{"args":["loveleetcode"],"want":2},{"args":[""],"want":-1}],"conv":null,"out":null,"norm":null,"big":{"kind":"text","n":200000,"h":"1bad6b8cf97131fc"}},"3.3":{"cases":[{"args":[["eat","tea","tan","ate","nat","bat"]],"want":[["ate","eat","tea"],["bat"],["nat","tan"]]},{"args":[[""]],"want":[[""]]},{"args":[["a"]],"want":[["a"]]},{"args":[["abc","bca","cab","xyz"]],"want":[["abc","bca","cab"],["xyz"]]}],"conv":null,"out":null,"norm":"groups"},"3.4":{"cases":[{"args":[[1,1,1,2,2,3],2],"want":[1,2]},{"args":[[1],1],"want":[1]},{"args":[[4,4,5,5,6],2],"want":[4,5]},{"args":[[3,0,1,0],1],"want":[0]}],"conv":null,"out":null,"norm":null},"3.5":{"cases":[{"args":[[100,4,200,1,3,2]],"want":4},{"args":[[0,3,7,2,5,8,4,6,0,1]],"want":9},{"args":[[]],"want":0},{"args":[[5]],"want":1},{"args":[[1,2,0,1]],"want":3}],"conv":null,"out":null,"norm":null,"big":{"kind":"perm","n":200000,"h":"b552e632666bbf61"}},"3.6":{"cases":[{"args":[[1,1,1],2],"want":2},{"args":[[1,2,3],3],"want":2},{"args":[[1,-1,0],0],"want":3},{"args":[[3,4,7,2,-3,1,4,2],7],"want":4},{"args":[[],0],"want":0}],"conv":null,"out":null,"norm":null,"big":{"kind":"ints_k","n":100000,"lo":-5,"hi":5,"k":7,"h":"a45e1b53e148cd39"}},"4.1":{"cases":[{"args":[[2,1,5,1,3,2],3],"want":9},{"args":[[5],1],"want":5},{"args":[[-1,-2,-3],2],"want":-3},{"args":[[1,2,3,4],4],"want":10}],"conv":null,"out":null,"norm":null,"big":{"kind":"ints_k","n":200000,"lo":-100,"hi":100,"k":5000,"h":"dd631975366798a9"}},"4.2":{"cases":[{"args":["abcabcbb"],"want":3},{"args":["bbbbb"],"want":1},{"args":["pwwkew"],"want":3},{"args":[""],"want":0},{"args":["abba"],"want":2},{"args":["dvdf"],"want":3}],"conv":null,"out":null,"norm":null,"big":{"kind":"text","n":200000,"h":"6f4b6612125fb3a0"}},"4.3":{"cases":[{"args":[[1,8,6,2,5,4,8,3,7]],"want":49},{"args":[[1,1]],"want":1},{"args":[[4,3,2,1,4]],"want":16},{"args":[[1,2,1]],"want":2}],"conv":null,"out":null,"norm":null,"big":{"kind":"ints","n":200000,"lo":1,"hi":10000,"h":"509d2b67eaf48a04"}},"4.4":{"cases":[{"args":[[-1,0,1,2,-1,-4]],"want":[[-1,-1,2],[-1,0,1]]},{"args":[[0,1,1]],"want":[]},{"args":[[0,0,0,0]],"want":[[0,0,0]]},{"args":[[-2,0,1,1,2]],"want":[[-2,0,2],[-2,1,1]]}],"conv":null,"out":null,"norm":"sorted"},"4.5":{"cases":[{"args":["ADOBECODEBANC","ABC"],"want":"BANC"},{"args":["a","a"],"want":"a"},{"args":["a","aa"],"want":""},{"args":["aa","aa"],"want":"aa"},{"args":["ab","b"],"want":"b"},{"args":["bba","ab"],"want":"ba"}],"conv":null,"out":null,"norm":null},"5.1":{"cases":[{"args":["{[()]}"],"want":true},{"args":["(]"],"want":false},{"args":[""],"want":true},{"args":["(("],"want":false},{"args":["())"],"want":false},{"args":["([]{})"],"want":true}],"conv":null,"out":null,"norm":null},"5.2":{"cases":[{"args":[[73,74,75,71,69,72,76,73]],"want":[1,1,4,2,1,1,0,0]},{"args":[[30,40,50,60]],"want":[1,1,1,0]},{"args":[[30,20,10]],"want":[0,0,0]},{"args":[[50]],"want":[0]}],"conv":null,"out":null,"norm":null,"big":{"kind":"ints","n":200000,"lo":30,"hi":100,"h":"c8bb251c6fb6f90f"}},"5.3":{"cases":[{"args":[["2","1","+","3","*"]],"want":9},{"args":[["4","13","5","/","+"]],"want":6},{"args":[["7","-2","/"]],"want":-3},{"args":[["10","6","9","3","+","-11","*","/","*","17","+","5","+"]],"want":22}],"conv":null,"out":null,"norm":null},"5.4":{"cases":[{"args":[[["a",3],["b",1]],2],"want":[["a",2],["b",2]]},{"args":[[["x",5]],5],"want":[["x",1]]},{"args":[[["a",1],["b",1],["c",1]],2],"want":[["a",1],["b",1],["c",2]]},{"args":[[],3],"want":[]}],"conv":null,"out":null,"norm":null},"6.1":{"cases":[{"args":[[-1,0,3,5,9,12],9],"want":4},{"args":[[-1,0,3,5,9,12],2],"want":-1},{"args":[[5],5],"want":0},{"args":[[],1],"want":-1},{"args":[[1,3],1],"want":0},{"args":[[1,3],3],"want":1}],"conv":null,"out":null,"norm":null},"6.2":{"cases":[{"args":[5,4],"want":4},{"args":[1,1],"want":1},{"args":[10,1],"want":1},{"args":[10,10],"want":10},{"args":[2000000000,1702766719],"want":1702766719}],"conv":"bad_version","out":null,"norm":null},"6.3":{"cases":[{"args":[[[1,3],[2,6],[8,10],[15,18]]],"want":[[1,6],[8,10],[15,18]]},{"args":[[[1,4],[4,5]]],"want":[[1,5]]},{"args":[[[5,7]]],"want":[[5,7]]},{"args":[[[1,10],[2,3],[4,5]]],"want":[[1,10]]},{"args":[[[3,4],[1,2]]],"want":[[1,2],[3,4]]}],"conv":null,"out":null,"norm":null},"6.4":{"cases":[{"args":[[3,2,1,5,6,4],2],"want":5},{"args":[[3,2,3,1,2,4,5,5,6],4],"want":4},{"args":[[1],1],"want":1},{"args":[[7,7,7],2],"want":7}],"conv":null,"out":null,"norm":null,"big":{"kind":"ints_k","n":200000,"lo":-100000,"hi":100000,"k":100,"h":"d0e4aa890ca707e3"}},"7.1":{"cases":[{"args":[[1,2,3,4,5]],"want":[5,4,3,2,1]},{"args":[[1,2]],"want":[2,1]},{"args":[[]],"want":[]},{"args":[[7]],"want":[7]}],"conv":"list_in","out":"list_out","norm":null},"7.2":{"cases":[{"args":[[3,2,0,-4],1],"want":true},{"args":[[1,2],0],"want":true},{"args":[[1],-1],"want":false},{"args":[[],-1],"want":false},{"args":[[1,2,3],-1],"want":false}],"conv":"cycle_in","out":null,"norm":null},"7.3":{"cases":[{"args":[[3,9,20,null,null,15,7]],"want":3},{"args":[[1,null,2]],"want":2},{"args":[[]],"want":0},{"args":[[1,2,3,4,null,null,null,5]],"want":4}],"conv":"tree_in","out":null,"norm":null},"7.4":{"cases":[{"args":[[3,9,20,null,null,15,7]],"want":[[3],[9,20],[15,7]]},{"args":[[1]],"want":[[1]]},{"args":[[]],"want":[]},{"args":[[1,2,3,4,5,6,7]],"want":[[1],[2,3],[4,5,6,7]]}],"conv":"tree_in","out":null,"norm":null},"7.5":{"cases":[{"args":[[2,1,3]],"want":true},{"args":[[5,1,4,null,null,3,6]],"want":false},{"args":[[]],"want":true},{"args":[[5,4,6,null,null,3,7]],"want":false},{"args":[[2,2,2]],"want":false}],"conv":"tree_in","out":null,"norm":null},"8.1":{"cases":[{"args":[["11000","11000","00100","00011"]],"want":3},{"args":[["111","010","111"]],"want":1},{"args":[["0"]],"want":0},{"args":[["10101"]],"want":3}],"conv":null,"out":null,"norm":null},"8.2":{"cases":[{"args":[["..#","#..","..."]],"want":4},{"args":[["."]],"want":0},{"args":[[".#","#."]],"want":-1},{"args":[["....",".##.","...."]],"want":5}],"conv":null,"out":null,"norm":null},"8.3":{"cases":[{"args":[4,[[1,0],[2,0],[3,1],[3,2]]],"want":null},{"args":[2,[[1,0],[0,1]]],"want":null},{"args":[3,[]],"want":null},{"args":[1,[]],"want":null}],"conv":null,"out":null,"norm":"topo","want_cycle":{"[4, [[1, 0], [2, 0], [3, 1], [3, 2]]]":false,"[2, [[1, 0], [0, 1]]]":true,"[3, []]":false,"[1, []]":false}},"8.4":{"cases":[{"args":[4,[[0,1,4],[0,2,1],[2,1,2],[1,3,1]]],"want":4},{"args":[2,[]],"want":-1},{"args":[3,[[0,1,5],[1,2,5],[0,2,20]]],"want":10},{"args":[1,[]],"want":0}],"conv":null,"out":null,"norm":null},"9.1":{"cases":[{"args":[1],"want":1},{"args":[2],"want":2},{"args":[4],"want":5},{"args":[10],"want":89},{"args":[45],"want":1836311903}],"conv":null,"out":null,"norm":null},"9.2":{"cases":[{"args":[[2,7,9,3,1]],"want":12},{"args":[[1,2,3,1]],"want":4},{"args":[[]],"want":0},{"args":[[5]],"want":5},{"args":[[2,1,1,2]],"want":4}],"conv":null,"out":null,"norm":null},"9.3":{"cases":[{"args":[[1,2,5],11],"want":3},{"args":[[2],3],"want":-1},{"args":[[1],0],"want":0},{"args":[[1,3,4],6],"want":2},{"args":[[186,419,83,408],6249],"want":20}],"conv":null,"out":null,"norm":null},"9.4":{"cases":[{"args":[[1,2,3]],"want":[[],[1],[1,2],[1,2,3],[1,3],[2],[2,3],[3]]},{"args":[[]],"want":[[]]},{"args":[[0]],"want":[[],[0]]},{"args":[[4,5]],"want":[[],[4],[4,5],[5]]}],"conv":null,"out":null,"norm":"sets"},"9.5":{"cases":[{"args":["abcde","ace"],"want":3},{"args":["abc","abc"],"want":3},{"args":["abc","def"],"want":0},{"args":["","x"],"want":0},{"args":["bsbininm","jmjkbkjkv"],"want":1}],"conv":null,"out":null,"norm":null},"10.1":{"cases":[{"args":[[["a",0],["a",20],["b",25],["a",70]]],"want":{"a":2,"b":1}},{"args":[[]],"want":{}},{"args":[[["x",0],["x",30],["x",61]]],"want":{"x":2}},{"args":[[["u",5],["v",5],["u",100],["v",120]]],"want":{"u":2,"v":2}}],"conv":null,"out":null,"norm":null},"10.2":{"cases":[{"args":[[["asha","IN",20],["ravi","IN",15],["ravi","IN",10],["ben","UK",5]]],"want":{"IN":"ravi","UK":"ben"}},{"args":[[]],"want":{}},{"args":[[["b","SG",10],["a","SG",10]]],"want":{"SG":"a"}}],"conv":null,"out":null,"norm":null},"10.3":{"cases":[{"args":[[{"id":1,"email":" A@X.COM","amount":"5"},{"id":2,"email":"bad","amount":1}]],"want":[[{"id":1,"email":"a@x.com","amount":5.0}],[2]]},{"args":[[{"id":3,"email":"c@d.e","amount":"-1"},{"email":"x@y.z","amount":1},{"id":4,"email":"q@w.e","amount":null},{"id":5,"email":"Q@W.E ","amount":"2.50"}]],"want":[[{"id":5,"email":"q@w.e","amount":2.5}],[3,null,4]]},{"args":[[]],"want":[[],[]]}],"conv":null,"out":null,"norm":null},"10.4":{"cases":[{"args":[[[1,4,5],[1,3,4],[2,6]]],"want":[1,1,2,3,4,4,5,6]},{"args":[[]],"want":[]},{"args":[[[],[1]]],"want":[1]},{"args":[[[5],[1,2,3],[4]]],"want":[1,2,3,4,5]}],"conv":null,"out":null,"norm":null},"10.5":{"cases":[{"args":[2,[["put",1,1],["put",2,2],["get",1],["put",3,3],["get",2],["put",4,4],["get",1],["get",3],["get",4]]],"want":[1,-1,-1,3,4]},{"args":[1,[["put",1,1],["get",1],["put",2,2],["get",1],["get",2]]],"want":[1,-1,2]},{"args":[2,[["get",5]]],"want":[-1]}],"conv":null,"out":null,"norm":null}}
PYEOF
