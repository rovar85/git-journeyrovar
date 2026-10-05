/* Coding track: setup stepper and quizzes for lessons C0 to C11 */
(function(){
  var S=[
    ["Open PowerShell","Click the Start menu, type PowerShell, and open it. A window with a prompt appears. This is where you type commands. (You used it earlier in this project.)","(nothing to type yet)"],
    ["Check that Python is installed","Type the command below and press Enter. You should see something like \"Python 3.12.4\". If Windows says it cannot find python, try py --version. If neither works, install Python from python.org and tick \"Add Python to PATH\" in the installer.","python --version"],
    ["Make a folder for your work","mkdir creates a folder and cd moves into it.","mkdir ev-agent\ncd ev-agent"],
    ["Create your first file","This opens Notepad. If it asks whether to create a new file, say yes. Type the one line below, then save and close. If Notepad saves it as hello.py.txt, choose \"All files\" under Save as type and name it hello.py.","notepad hello.py\n\n(type this line in Notepad:)\nprint(\"Hello, Enterprise Vault\")"],
    ["Run it","You should see your sentence printed back. That is a complete program.","python hello.py\n\nHello, Enterprise Vault"],
    ["Break it on purpose, then read the error","Change print to prnt in Notepad, save, run again. Read the LAST line of the error first.","python hello.py\n\nTraceback (most recent call last):\n  File \"hello.py\", line 1, in <module>\n    prnt(\"Hello, Enterprise Vault\")\nNameError: name 'prnt' is not defined"]
  ];
  H.stepper($("#su-step"),S,function(s,i,body){
    body.innerHTML="<p style='margin:.3rem 0'><b>"+(i+1)+". "+esc(s[0])+"</b></p><p style='margin:.3rem 0'>"+esc(s[1])+"</p><div class='pre-out'>"+esc(s[2])+"</div>";
  });
})();

Q.c15=[
  {q:"In PowerShell, which command runs a file called hello.py?",o:["python hello.py","run hello.py","open hello.py"],a:0,f:"You hand the file to the Python interpreter: python hello.py."},
  {q:"A Python error message appears. Where should you start reading?",o:["The first line","The last line, which names the kind of mistake and what went wrong","Nowhere. Errors cannot be understood"],a:1,f:"The last line says what went wrong. The lines above say where."},
  {q:"In the step-through player, the highlighted line is...",o:["The line that has just finished","The line that is about to run","A line with an error"],a:1,f:"The Variables and Output boxes show the state before the highlighted line runs."},
  {q:"Where should an API key be kept?",o:["Inside the Python file, so it is handy","In an environment variable, never in code or chats","In a comment"],a:1,f:"Anyone who sees the key can spend your money. Keep it out of files you might share."}
];
Q.c16=[
  {q:"What does print(\"That is\", round(hours_down, 2), \"hours\") show when minutes_down is 42?",o:["That is 0.7 hours","That is 42 hours","That is 2520 hours"],a:0,f:"42 divided by 60 is 0.7."},
  {q:"minutes_down is changed to 20. What is is_urgent?",o:["True","False","20"],a:1,f:"20 > 30 is false."},
  {q:"In Python, what does the single = mean?",o:["Is equal to","Put this value into the labelled box","Add"],a:1,f:"= stores a value in a variable. A comparison of equality uses ==."},
  {q:"Which of these is text (a string)?",o:["\"EV01\"","42","True"],a:0,f:"Text is written inside quotes."}
];
Q.c17=[
  {q:"After servers.append(\"EV03\"), what does len(servers) give?",o:["3","4","5"],a:1,f:"The list started with 3 items and one was added."},
  {q:"What is servers[0]?",o:["\"EV01\", the first item","\"EV02\", the first item","An error"],a:0,f:"Counting starts at 0."},
  {q:"After the loop, what is stopped?",o:["[\"EV02\"]","[\"EV01\", \"EV03\"]","[]"],a:1,f:"EV01 and EV03 have status Stopped."},
  {q:"What happens if you ask a dictionary for a label it does not have?",o:["It returns 0","A KeyError","Nothing"],a:1,f:"KeyError: that label is not there. record.get(label) returns None instead."}
];
Q.c18=[
  {q:"The event log has two ERROR lines. Which message prints?",o:["No errors","One error: keep watching","Several errors: likely a real problem"],a:2,f:"errors is 2, so errors >= 2 is true."},
  {q:"You delete one ERROR line. Which message prints now?",o:["Several errors: likely a real problem","One error: keep watching","No errors"],a:1,f:"errors is 1, so the elif branch runs."},
  {q:"Why does every agent loop need an exit condition or a step limit?",o:["A loop whose condition never becomes false runs forever","Python forbids loops","It makes the agent smarter"],a:0,f:"An unbounded loop can spin, wasting time and money."},
  {q:"What does the indentation tell Python?",o:["Nothing, it is decoration","Which lines belong inside the if or loop above","How fast to run"],a:1,f:"Indented lines are grouped under the line that ends with a colon."}
];
Q.c19=[
  {q:"What does summarise(get_service_status(\"EV01\", \"Search\")) print?",o:["Search on EV01: Running","Search on EV01: Unknown","An error"],a:1,f:"known.get(service, \"Unknown\") returns Unknown for a missing key."},
  {q:"What is the difference between return and print?",o:["None","return hands a value back to the program. print only shows it to a human","print is faster"],a:1,f:"A tool must return its result so the loop can send it back to the model."},
  {q:"Why does a good docstring matter for an agent tool?",o:["It makes the function run faster","It becomes part of the description a model reads when choosing tools","It is required by Python"],a:1,f:"Models see only the description, so it must be clear."},
  {q:"What does the def line do?",o:["Runs the function","Defines the function so it can be called later","Deletes it"],a:1,f:"Defining does not run. Python just remembers the recipe."}
];
Q.c20=[
  {q:"For server WEB9, what ends up in the result?",o:["reachable true","reachable None and error \"unknown server: WEB9\"","The program crashes"],a:1,f:"The tool raises ValueError, except catches it, and the error becomes data."},
  {q:"What does json.dumps do?",o:["Turns a dictionary into JSON text","Deletes a file","Sends an email"],a:0,f:"json.loads does the reverse."},
  {q:"Why return an error as data instead of crashing?",o:["So the model can read it and adjust its next request","Because errors are invisible","To hide problems"],a:0,f:"From Chapter 11: errors go back to the model as data."},
  {q:"If you remove try and except and WEB9 is passed in, what happens?",o:["Nothing","The ValueError is not handled and the program stops","It prints reachable true"],a:1,f:"An unhandled problem stops the program."}
];
Q.c21=[
  {q:"In a method, what does self mean?",o:["This particular object","The programmer","The class name"],a:0,f:"self.goal is the goal of this object."},
  {q:"After two add_evidence calls, how many items does case.evidence hold?",o:["1","2","0"],a:1,f:"Each call appends one fact."},
  {q:"What hypothesis does case.report() print at the end?",o:["none yet","the service stopped","SQL connection problem"],a:2,f:"The second call replaced the hypothesis."},
  {q:"Which course idea does the Investigation class illustrate?",o:["Tokenization","Agent state: goal, evidence and hypothesis","Embeddings"],a:1,f:"Frameworks keep larger state objects for the same purpose."}
];
Q.c22=[
  {q:"In C7, you set \"sql_reachable\": True. How many tools run before decide_next returns None?",o:["3","4","1"],a:0,f:"status, event logs, SQL test. The SQL test is reachable, so the DNS check is not requested."},
  {q:"Which single function would a language model replace?",o:["get_service_status","decide_next","print"],a:1,f:"Same tools, same loop, same history. Only the decision changes."},
  {q:"What does TOOLS store?",o:["The results of calling each tool","The functions themselves, by name","Only text"],a:1,f:"TOOLS[tool]() looks up a function by name and then calls it."},
  {q:"What flaw did the lesson point out in the last line?",o:["It prints a fixed conclusion that ignores the evidence","It has a typo","It is too long"],a:0,f:"A tester would change LAB and see the diagnosis no longer matches."}
];
Q.c23=[
  {q:"You change the third scenario's expectation to \"SQL unreachable\" and run it. What happens?",o:["Still 3/3 PASS","The third case shows FAIL, the rate is 67%, and the assert stops the run","Nothing prints"],a:1,f:"The program answers \"needs human\", so it no longer matches. 2 of 3 passed and assert rate == 1.0 fails."},
  {q:"How is the task success rate calculated?",o:["passes ÷ total cases","total ÷ passes","failures + 1"],a:0,f:"2 passes out of 3 is about 67%."},
  {q:"What is a regression?",o:["Something that used to pass but now fails after a change","A new feature","A faster program"],a:0,f:"A regression suite catches this every time you change the agent."},
  {q:"Why do you run a language-model brain several times per scenario?",o:["It can give different answers each time, so you measure reliability as well as capability","It is cheaper","Models only work on the third try"],a:0,f:"Chapter 9: pass^k versus pass@k."}
];
Q.c24=[
  {q:"Why is delete_data denied even with human_ok=True?",o:["It is on no list, and unknown tools are denied by default","The human typed wrongly","Python blocks the word delete"],a:0,f:"Deny by default is the final else branch."},
  {q:"What is printed for the denied calls?",o:["[\"restart_service\", \"delete_data\"]","[\"delete_data\"]","[]"],a:0,f:"The first restart_service call (without approval) and delete_data were denied."},
  {q:"Who decides whether a proposed tool call runs?",o:["The model, if it is confident","The policy gate in your code","Nobody"],a:1,f:"Authorisation is a software policy decision."},
  {q:"What is a trace for?",o:["Reconstructing exactly what the agent did and why, after the fact","Making the program faster","Hiding errors"],a:0,f:"Observability: one line per step, searchable and replayable."}
];
Q.c25=[
  {q:"Where should an API key live?",o:["In an environment variable, never in shared code or chats","In the file name","In a screenshot"],a:0,f:"If a key leaks, revoke it and create a new one."},
  {q:"My first MCP attempt used FastMCP and failed. What does this teach?",o:["MCP is broken","The library had changed in version 2 (renamed MCPServer), so always check versions and current docs","Python is broken"],a:1,f:"This matches the warning that MCP is still changing."},
  {q:"Which is a good habit when coding with an AI assistant?",o:["Run whatever it writes immediately on production","Write the expected results first, read the code before running, start with harmless read-only data","Paste your API key so it can help"],a:1,f:"You stay the engineer: tests first, read before running, harmless first."},
  {q:"What four questions apply to every tool call and MCP server?",o:["Who can call it, what can they call, where can it act, what gets logged","Colour, size, speed, price","Name, date, time, place"],a:0,f:"From Chapter 10."}
];
Q.c26=[
  {q:"In the final evaluation, what did the gate do with the eager brain?",o:["Allowed its restarts","Blocked all four restart attempts while the diagnoses stayed correct","Crashed the program"],a:1,f:"The gate enforces policy without needing to know the brain was misbehaving."},
  {q:"Which function would you replace to use a real language model?",o:["brain()","gate()","evaluate()"],a:0,f:"Same loop, tools, gate and trace. Only the decision changes."},
  {q:"Why include scenarios where the right answer is to escalate or report no fault?",o:["A good agent knows when to stop and when to ask a human","They are easier","Tests need exactly four cases"],a:0,f:"Escalation and no-fault cases measure judgement, not just diagnosis."},
  {q:"In which order should you do the upgrades?",o:["Replace the brain first","Add scenarios, tools, a trace and approval first, measure each step, and replace the brain last","Skip the tests"],a:1,f:"Understand first, code second, framework third. Measure after every change."}
];
