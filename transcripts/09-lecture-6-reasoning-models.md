# k5Fh-UgTuCo

Source: https://www.youtube.com/watch?v=k5Fh-UgTuCo

Hello everyone and again welcome to lecture six of CME295. Uh so today is actually an exciting day because we're going to uh cover a topic that has been trending over the past year or so which is LLM reasoning. And it's actually a good segue compared to what we talked last time which was uh

preference tuning because a lot of the methods that we used in lecture five are going to be the ones that we'll be using as kind of the foundations for this lecture. So before we start as usual we're going to uh just cover quickly what we saw in the last lecture.

So if you remember lecture four and lecture five were all about learning how we can train a model. So in lecture four we saw the first part which was the pre-training part which is the most compute intensive step where we basically teach the model the structure of text the structure of codes and we do

this very large large scale training. So at the end of this first step which is the pre-training we get a model that knows about code that knows about language but it only knows how to autocomplete a sequence and so that's why we also saw uh the second step which was the finetuning step where we take

our pre-trained model and we try to make it useful. So one use case that we saw was for instance uh you know an assistant. So we tried to tune it in a way that it can respond to questions and so here we have uh this work of preparing the SFT data which which is what we call the SFT data

uh which is a high quality created data set that we can use to teach our model on how to behave. So at the end of this second step we have our model that is tuned for a specific task which can be um responding to queries. And then last lecture we saw this third step which was the preference tuning step.

And here the goal is to align our model with human preferences. So we saw in particular RHF which was a common method to do that and we saw that there was two steps to it. So there was the first part learning to distinguish good from bad using human preference data

and then there was this second step which was this RL stage which is going to be useful today. So in particular, if you remember, we had drawn a comparison between the RL setup that you may be familiar with uh outside of this class where we have uh an agent that is interacting with the

environment and the way that it interact with it is that given a given a state that it is in, it can take an action following ing a policy which is nothing else than just a probability distribution over actions. So given

a state our agent can take an action following this policy and at the result of this it receives some reward. And we saw last lecture that we have this nice comparison between the traditional RL setup and the LLM setup. And so here our quote unquote agent is just simply the LLM.

Um the environment that it interacts with is just the set of tokens that it can predict over. So given an input that it has received so far, it can predict what the next token could be which is the action and it does that using the probability distribution

that is the result of uh I guess the LM prediction. And we saw that we can obtain human preferences for each completion. So you have a prompt, you have a completion and you get those human preferences. And this is the one that you then use in

order to tune the LLM because here this step is about aligning the model with human preferences. And here the human preferences is encapsulated in the reward. And so we saw that the loss function during the RL stage is composed of two parts.

So the first part is this advantage maximization and we saw that that advantage was based on the rewards uh and it has some baseline to just reduce the variance of the gradient. Uh so we have that part but we also saw another part

which was that we don't want our model to deviate too much from either the previous iteration. So we don't want the model to change too much from iteration to iteration. But we also don't want our model to change too much compared to our initial model like our base model. And here it's

the SFT model. And the reason why we don't want to change too much is because our model has already learned a lot. It's already quite performant in what it does. And what we want is to just align it with human preferences which is not something for which we want the model to change completely.

And I think that was the part that um I think was a little bit scary which was the actual loss functions. So if you remember the main algorithm that is typically used in the RHF setting is PO which stands for proximal policy optimization and there is this one variant that's

called PO clip which is such that it clips the updates from one iteration to another. So here if you remember R is actually not the reward it is the ratio and I know it's a confusing confusing notation. So it's the ratio between the current policy and the old policy and the old

policy here is the policy that is at the previous RL iteration. So what we do is that we have a clipping mechanism such that the ratio cannot go beyond some certain thresholds such that we do not want to incentivize the model to make too big of an update.

And we saw another variant of PO which is called PPO kale penalty. And this variant uses the kale divergence to penalize the model from changing too much. So if you remember in the original PO paper uh you we used the old

quoteunquote old version of the model which is the one at the previous RL iteration. But in modernday RHF training, this scale divergence is typically applied to the base model, which is the SFT model. So I guess long story short is we have these two PO variants that were variants

that were introduced in the original PO paper. But in modernday RLF training, we typically have some combination, some mix of these two loss functions. Cool. So, up until now, we've seen what I want to call vanilla LLMs, which are LLMs

that take something as an input, let's say a prompt, and just respond with some answer. And so those vanilla LLMs, they have a lot of strength that we can enjoy. So, first of all, we had seen that those LLMs, they know a lot about structure of the text. They know a lot about codes.

So in particular, if you want to debug your code, I guess they're great to find where the error is. They are great to generate codes. They're also great to generate, I don't know, essays or poems. They're really, really good at that. But I do want to call out some weaknesses.

So the first, I guess, weakness that I want to call out in these vanilla LLMs is that they have quote unquote limited resoning. So typically if you kind of have it have uh some sophisticated let's say math problem it will not really um kind of come up with I guess the solution

because maybe it will like uh get lost in the in the way um because up until now our model has been really trained to I guess given a prompt respond to it using the kind of next token prediction. So I guess here there is not like really a big reason why it would be able to solve I guess complicated problems. So I

guess that is one. So second weakness is that the LLM that we have has been pre-trained on a huge amount of data which is static meaning that the knowledge that the LLM has acquired is bound to the cutoff date what we call the cutoff dates at which we cut and formed our pre-training data.

So I know a few days ago we had an election. So if let's say we trained our LLM based on data before the election and let's say today we ask it okay who is the I don't know elected official of let's say X it will not be able to answer us because it does not have access to knowledge after that date.

So a third weakness is so far it's uh all talk no action. So you just uh prompt your LLM but I guess if you want to let's say I don't know um like place an order or I don't know do some action you just cannot do it. And then I guess the last weakness which by the way is not an exhaustive list is

contrary to traditional NLP models LLMs they generate free form text and it's hard to evaluate them in the framework that we I mean by we is the ML community has adopted up until a few years ago. So if you're familiar with it, let's suppose if you worked in the translation world, you would use

rulebased metrics like blur or for summarization rouge to evaluate your outputs. But then here LLMs, they can really do more than just that. So it's very hard to evaluate them. So what I want to say is that this is let's say a subset of all the weaknesses that LMS can have. And the last three

are going to be topics that we will cover in the next lecture and in the lecture eight. And as I mentioned before, the focus of today is reasoning. So we'll see how we can improve the way our LLM reasons. Cool. And again, um this is a topic that's been very new and by new I mean

roughly a year. So almost everything that we will see is uh either from 2024 or 2025. And I guess we're lucky because now we have kind of enough hindsight to just know which piece is more important than other things. And so the goal for today is going to be to know what reasoning

models are. And the second big goal is to know how they are trained. So hopefully at the end of this lecture if you have a good answer to these two questions that means that we have done a good job. Okay. So let's start with reasoning

models. What are they? Well to answer this question we first need to I guess define what reasoning is. And the bad news here is there's not a commonly agreed upon definition out there of what reasoning is. So I will try to define it um I guess to the best of my ability. So here we define reasoning as the ability

to solve a problem. And here by problem we typically think more of math problems or let's say coding problems. But hopefully these abilities can also kind of spread to other fields as well. And in order to solve this problem, we typically need a multi-step reasoning

process. like a little bit like you when you take an exam when you have a question that's not trivial you typically break that down into several steps and then kind of go through them and then come to the final answer. So I guess the idea is problems that are reasoning problems they would have some

pattern of that. So to illustrate this let's uh just make sure we're all kind of thinking the same. So a non-reasoning question would be something like what is the course code of Stanford's transformers and LM class. So this one know it's a knowledge thing. Everyone knows it's CME 295.

But then um as opposed to that in contrast to that a reasoning based question would be maybe a math question. So for instance let's suppose we have a bear that was born in 2020. How old is that bear now in 2025? So that that would be the kind of question that we're looking at. Of course, this is super

easy. Can think of like something that's, you know, much harder than that and this would qualify. Cool. Okay. So now that we know a little bit what reasoning is, now we're going to look at how we can I guess obtain a model that can deal with these kinds of prompts.

So the core idea here is to leverage a concept we saw earlier in the class. So I'm not sure if you remember but back in lecture maybe two or three we saw a technique called chain of thought. So who remembers what chain of thought is? Yeah. Yes. Do you want to say what what

that is? Yeah. Yeah. Exactly. So the answer is you know thinking in steps be instead of just giving just a blanket answer. So great great answer. So here just to illustrate. Yeah. Yep. >> Oh yeah, great point. So the question is

uh for some questions you need to have some element of context. So for instance here you need for your LLM to know that this year I don't know today's November 7th 2025. So yes, great points. Um so there are two parts of that for that specific question. So typically LLMs they have a something that that we call

preamble. So something that tells you about some context uh and typically the date is something that we put in the preamble. So for this very specific case the date would be uh an information that would already be uh I guess available to the LM. But for some other problems, you can very well have information or

context that you do not have. And um in lecture 7, we will see how we can uh kind of fetch that. And it's definitely something that that will be very useful. Um but for the sake of today, we will consider this more as being an extension of reasoning models as opposed to something that is foundational to how

they work. But we'll respond to to this part I guess next lecture. Cool. And so here we were about to illustrate what a chain of thought look like. And so here um instead of having as you mentioned just a blanket answer what we want is to explain also the reasoning.

So the way Chenn thought did that was by having some in context learning examples that explicited the reasoning to encourage the model to also do that before providing the answer. So that's the rough it's not a rough idea it's the the idea behind chain of dots.

And here what we want to do is to do that but at a much larger scale. So I just want to build an intuition as to why this may help us. So LLMs they're basically trained with this next token prediction objective. And so the way they respond to questions that we ask is typically to sound

plausible in a way to maximize or optimize for the probability of the tokens that you want to generate to happen. So if you have a very hard problem that you're presenting to the LLM, there are very few chances that that problem appeared in the training sets.

And so here the idea is to have the LLM decompose the problem into tractable ones and then rely on the patterns that it has seen during training to solve all these more tractable problems. And it's a little bit like uh you or when we were students, right? Like when we give you a

problem, you try to kind of link it back to something that you know that you have seen at training time like during your studying to solve them in order to find the answer. So I guess that's the intuition. Um I guess another reason that you can think

of is when you let the LLM generate more tokens, you're just giving it more compute. If you think about it, because at each generation step, you have this whole forward path pass. And when you do that more, you just give it more compute.

And we will see there is a term that is dubbed compute budgets, which is I guess the budget that you want your L&M to have to generate your response that we will see later on. Uh but yeah, so that also plays a role. So, is everyone uh clear on the overall idea of what the reasoning model is?

Yeah. Okay. Perfect. So, just to make sure again that we're all clear on this. So, up until now, we had quote unquote vanilla LLMs that had some prompt, some question as input, and they were responding with something as output.

And in our case what we want is given a question as input we don't want to directly generate an answer we first want to think and here I guess we think by first outputting a reasoning chain and then we provide the answer. So here the LLM output is not just the

answer, it's the reasoning plus the answer. And I guess yeah, I was saying that this uh topic has been very hot and trendy for the past year. So this is a little bit of a preview of the timeline of reasoning models. Um so reasoning itself is a topic that has been studied for

more than a year but reasoning models have started popping out starting from OpenAI's release of 01 preview and this one was uh September of 2024 and then after that uh you basically have everyone just wondering how OpenAI did it and so you had you know all this

AI labs trying to kind of see what we can do to um I guess increase the reasoning abilities of the model. So you would have everyone working on this and then you had uh Google's Gemini 2.0 uh flash thinking that was I think released in December and then starting in 2025

uh there was this uh DeepSync R1 paper that was published in January which made a lot of noise because what they were able to do was to match OpenAI's reasoning ability performance with a method that they were actually you know describing ing in their paper. So that was a big moment January 2025

and then after that you know all these other models also had uh reasoning abilities added. So you had um some models from XAI from anthropic with clouds and then from uh other labs as well also from um uh Mistral. So this timeline is not exhaustive but it's just to show you I guess how recent these

models are and I guess one thing to have in mind is it basically started at the end of 2024. Cool. So I know a lot of you if not all of you are using uh LLM every day as you know chatbots like let's say chat GPT or Gemini and so I want you to know when the model that you're interacting with

is a reasoning model. So I have a question for you. I was having a discussion with Chad GPT the other day and I was wondering is this using a reasoning model because guess uh what do you think if you kind of stare at the screenshots?

Yeah. Why? Right. Exactly. So the key word here is thinking. Actually they they put it everywhere. But um when these UIs show you the thinking process so what they do is actually so they don't show you actually the full reasoning process and we're going to see

why. But they tell you that they spend time thinking and that time thinking is actually the time that is needed to produce the reasoning chain that can be I guess more or less something that takes time. Uh and so for instance for chip you have this uh thinking that you can also

change from standard to extended etc. And you have this for other models as well. And in particular, the thought that you the quote unquote thought summary that you see is not the raw reasoning chain. It's a summary of it. And the reason why they do that, I mean,

I'm hypothetizing is one because the raw chain maybe may not be something that is fully intelligible from a human standpoint. Second is because maybe you as a user you don't want to read pages and pages. And then third, this is going to be what we see. But

if you have the reasoning chains, if you have the reasoning chain, you can maybe uh train a model that you know is trained on these chains. So it can basically mimic those abilities as well. So this may be the reason the reasons why you would typically not see the raw chain

and when it comes to pricing so we saw that the output of reasoning models are not only the answer but also the reasoning itself and so you will see in I guess all of these APIs that you're actually getting charged for it so you're not necessarily getting all the reasoning chain but uh if you look at

the the ducks there's always I guess a sentence or two uh I guess that specifies that you're actually being charged for output tokens and those output tokens they also include reasoning tokens so I think that's also a good thing to know um and I guess from a user standpoint

this also gives an incentive to have the maximum imum reasoning ability for a minimum amount of reasoning token because you don't want to pay a lot, right? So, we're going to see later on how we can deal with that, but this is just one thing that's good to note. Cool. So, we talked about what reasoning

was or at least tentative definition. We saw I guess the core idea behind reasoning models. So now we're going to talk about some of the benchmarks that people use to quantify reasoning abilities. So the first one as I previously mentioned is about assessing the coding

abilities. And so here the goal is typically to solve a coding problem or to fix a bug. So you typically have the following setup. So given a problem, you want to produce a solution that

is able to pass test cases. So if you have a solution that you that passes all test cases, then you have a solution that works. And this is our way of verifying that a response that was generated is actually a correct one. So that's for coding.

Um okay so just giving you an overview of the kinds of benchmarks that are out there. So we have uh human eval which is uh the screenshots here which I believe is a set of 100 something coding problems that were human written which is why it's called human evil. But you have then code forces uh which is coming

from a website of competitive programming that some of you may know and there is also swbench uh which is I believe a set of problems that were derived from GitHub issues. So these are like real practical problems. So you will see that these reasoning models in the reports they typically have

results along these benchmarks. So this is for coding. Now for math the goal is to you know solve a problem and the way it works here is given a problem you want the answer and of course you're letting your model you know generate some reasoning.

And so here what you would do to verify that your solution works is by parsing the answer like like so and then comparing it with some ground truth. So here you can really know if the answer that your model is producing is true by comparing the two.

So you will ask me okay how do you parse that? So you can force your model and by force I mean in the prompt to output the answer in a way that can be parsible. Sometimes people they just put it in some box in the box brackets. So there's a number of different ways to do that and uh this is uh how the problems look

like. So uh you have some problem and then you can let your model uh you know generate some reasoning chain along with the answer and then you have the answer here that you can compare to. Um so I just want to add that um the kinds of benchmarks that are out there are based typically on problems that are actually

not that trivial. So a name that you will see a lot is AIM. So I'm not sure if you're familiar with it. It's um a math exam to qualify for the US math olympiads. Um so there is a bunch of models that um I guess um quantify their performance based on that. There's also GSM 8K which

is a grade school kind of math problem. And I guess now your question maybe okay it's great we have all these benchmarks but what is the metric that you will use to quantify that what you're doing is good or not and so there is one metric that you will see a lot and we're going to see that

right now because it's not that obvious. So that metric is called pass at K. So pass at K is by definition a metric that tries to estimate the probability that at least one of K attempts succeeds. So here what we're saying is let's suppose we're I don't know having some

coding problem. We tell our model to generate K answers and pass at K is the probability that at least one of these K answers passes the tests. Does that make sense? So, by the way, why would you have pass

at K? Like why why would that make sense? Okay, so it's not super trivial. Um, so you may have use cases where you can afford to spend more time to generate more answers. If you know that you will get more chances to get it right,

then you can spend more time to generate more answers so that you can can have like the right one. So in a problem like coding, the good thing is you can check whether your answer is correct or not. And so here the idea is if you are in cases where you can afford to generate

not just one answer but multiple answers then it may be worth it to just spend more time spend more compute to generate more answers if it means that the probability of getting it right in one of them is going to be higher. So there is one technique that we saw last lecture that

is kind of familiar with this best of n. Do you remember? Yeah roughly. Okay. So best of n is this method that we saw last last week which was you generate n answers and you use your reward model to score everything and you take the best best of all of them. So here you can think of it as

being kind of the same just that we do not have a reward model. We have a deterministic verifiable way of checking whether something is correct. So it's very similar to that. And okay so now we're going to spend just a few minutes just um aligning our

understanding on um how we can estimate such a quantity. Yep. That's a great question. So question is uh do you uh choose a particular temperature? So I have a slide on that. So I I'll just hold your question for a few slides. Cool. Wait. By the way, if

there is any other questions uh you know happy to Is there any other questions on this? Everyone is super clear. Okay. Cool. So what we want to do here is to estimate this probability. But you may tell me okay just generate k attempts and just count the number of uh

of the attempts that are um correct to estimate that. But the problem is if you only do this k times your estimate can be very noisy because by pure chance I don't know you may have uh one instance that has I don't know three correct out of five and the other one one. So you want to have

an estimate that doesn't have that much variance. So what you do is you typically generate not k but n answers and out of these n answers you are going to have c of them that are going to be successful and then n minus c that are not going to be successful. And the question here that you ask

yourself is out of these n attempts you want to quantify your the probability of having at least one out of k attempts that is right. So the question here if you have those n observations if you were to select let's say k

what is the probability of having at least one of those k passing? That's the question. So we're short on time. Uh I'm going to actually uh derive that right now. Um, and the reason why I want to do that is because the answer is not necessarily trivial and I don't want you to be uh

too uh you know uh surprised of how how it looks like without uh kind of knowing where it comes from. So we're going to derive that. So we want to derive the probability that at least one attempt out of k that we select out of these n samples is correct.

So in order to do that I'm just going to write that down. So pass k. So we want the estimate for that. So, it's going to be the probability that at least one attempt out of K is correct. So if you've done some probability there

is like a very common trick which is if you have a probability of at least one it's one minus the probability of having all of them being incorrect. Do you all know that trick? Okay. So we're going to use that trick. So it's going to be one minus the probability

of having all k attempts uh incorrect. So far so good. Yeah. Okay. So now we're going to try to quantify this probability. So what is the probability of you finding

an unsuccessful attempt among this n? You have n minus c unsuccessful. you have n observations is going to be n minus c over n. Right? So it's your first it's your first unsuccessful attempt.

So now what is the probability that you have another unsuccessful attempt knowing this one? So you have n minus c minus one other unsuccessful attempts over n minus one because you already took one and you continue that k times

n - c - k + 1 over n - k + 1. Does everyone agree with me? So here we are quantifying the probability that if we take k samples randomly among these n that all k1s are incorrect. So here

we compute this by computing the probability that the first attempt is incorrect and then the second one is incorrect knowing that the first one was incorrect and so on which we have for which we have this uh formula. So if you uh saw that in probability class, it's basically the same as

sampling without replacement. And now the nice thing with this is that you can express that with a nice mathematical notation. So for people who know so n choose k is equal to factorial n factorial k

factorial n minus k. So this is by definition of what this quantity is about. So we're going to use that here. So here we have a series of products. So here we can express that as factorial over another factorial. So here it's factorial n minus c

over factorial n minus c minus k. And then this quantity we can also express express that with factorials. So it's factorial n and then numerator is factorial n minus k. Everyone agrees with the math here. I take that as a yes.

And so here we're going to somehow pop the expression above up. So it's going to be equal to 1 minus um so n minus c factorial over n - c minus k factorial and then k factorial and then here we're going to say it's

this one k factorial k factorial over n factorial. So here I did a a trick. What I did was I basically multiplied the numerator and the denominator by k factorial. And so here I have 1 minus. So this is

n minus c over n. So n minus c choose sorry n minus c choose k over n choose k. So this this is our estimate

of pass at k. Does everyone agree? Yeah. Okay. So, the reason why I derived it is uh because that this formula can be a little bit daunting to look at, but it's actually quite um natural because it's

only using some sampling without replacement um considerations. And so, you will see in papers that people have this pass K metric. So if you were to compute it, this would be the formula to use. Cool. And uh special K of pass at K is

pass at one and pass at one is defined as the probability of a single attempt succeeding. So this is something that is more uh something that you you commonly know. Uh so if suppose you have a model that produces an answer what is the

probability that is correct. So if you replace K with one you will see that this formula will simplify a lot and it will be just a proportion of successful attempts which also makes sense just intuitively. Cool. Everyone clear with this? Yeah.

Great. Um so now to your question um so what do you do with the temperature and you're exactly right when you generate these solutions multiple times something that will influence your results is how diverse the solutions that you will generate will be and this is something that you

indeed use the temperature for. Now, okay. So, what is the relationship between temperature and pass K? Do do we want low temperature? Do we want a high temperature? Or do we want something in the in between? Well, if you take a very low

temperature, you know that your solutions will be good, but they will not be diverse. So if you increase the number of number of samples that you generate that quantity would not change which is seen with uh this graph with the t equal to0 it doesn't change but then when you have

t equal to 0.2 two. Now it increases because you have some diversity. But if you increase this temperature too much, then you will have the diversity that you want, but they will also harm the performance of your predictions because maybe the tokens that were not that

likely would become likely. And so here on the opposite side, we have I don't know t= 1.2 two here which is extreme in this in this example which is not the best. So I guess to respond to you uh typical temperature choice would be something that is not too large not too small and I believe in this example is t

equal to8 that I think produces the best results towards the bigger samples but then here I guess it's not clear maybe 04 so that's why you will see that in papers people always specify the temperature that they choose to produce the

benchmark results. So that's why it's uh good to have have that in mind. Cool. So these are the main metrics that people use but not the only ones. There's another one that you may see which is called consensus at K which is the answer that is coming from

the highest number of times that the answer appears among your generations and you can think of the self-consistency technique as being very related to that. Um so yes so you may see that and then the other metrics that you will see in those benchmarks are typically the ones

that you're familiar with uh like accuracy exact match and so on. Cool. Okay. I took a lot of time on this first part. I think I need to go a bit faster. But does that roughly make sense so far? Yeah. Okay. So right now I hope you know what a reasoning model is. So now we're

going to go into the most interesting part of the lecture which is how can we build such a reasoning model. So we know we want our reasoning model to produce a reasoning chain but right now we don't really know how to do that at scale and this is going to be the main focus in this part. So here the idea is to

somehow incentivize the model to produce a chain of thought a reasoning chain before answering. So the problem with that is that reasoning chains writing is a very tough task especially for I guess long reasoning long reasoning chains and for that let's suppose if we were to

go look into our toolbox of the techniques we have learned so far you know maybe we can think okay we can use SFT to do that but the problem with SFT is you need high quality data and in particular you would need to write all these reasoning chains. Let's suppose you do not have these

reasoning chains. So how do you do that? You would typically write them from scratch but that is very hard. So that's one uh I guess one vote one vote to not do SFT if we don't have any reasoning chains. So the second reason here is or the second fact is that the way the model

reasons may be different from the way we reason and for that maybe a human written human written reasoning may not be the best way to teach the model on how to reason. So that's the second fact which is uh going against having some human written

human written reasoning chains as SFT data. And then the third fact that I want to say is we just saw that these reasoning tasks they have a very natural rewards which is actually verifiable. So for coding you know if your thing works if it passes some test cases if it

compiles and for math you know if it works if the answer is the same as your ground truth. So naturally you do have a reward signal. So we saw there's a reward signal sft is not the great way to start from scratch. Well what do you do? Well, let's uh try

RL then. And the good thing is last week we saw how RL works in the case of LLMs. So I guess that's great timing. So how would we do that? So just as a reminder, we want to teach our model to solve these more complicated problems and we also want to teach it to reason before.

So in order to do that, we first want to have a reward that checks whether the reasoning chain is there. So here you can do that by simply checking whether the model has produced a reasoning chain and you can check that by checking the presence let's say of

the think start and end token that you can instruct your model to use to insert its reasoning chain. And then the second reward that you want to have is to check that the solution that it produced actually works. And so here as we mentioned this is something that you can actually do for the

benchmarks that we we care about. So for code you would check that it works for all cases. For math you would just verify with respect to the you know answer being the same as the ground truth. So we also have that. So in summary, we will run RL and we will run RL using a reward that is a

combination of checking whether the think tokens are here are here and that the end result is correct. And we saw that both of them we can do this easily. No need for a model. Cool. So let's suppose you do that. Let's suppose you you do RL on such rewards.

Well the nice thing that you see is if you plot the performance of the model with respect to one of those benchmarks that I mentioned. So here it's aim. So if you remember it's the math benchmark. You see that as you perform your RL steps, the performance of the model on those

benchmarks, they actually increase and they actually increase quite significantly. So the graph here is actually coming from uh the training of deepseek R1 actually R10 here which we will see a little bit more in detail with Shervin how it actually works. But you can see

that if you incentivize the model to think and produce the right answer, it can actually learn quite meaningfully only with these two like verifiable rewards. Cool. But now you may wonder, okay, let's suppose I'm teaching my model to think. Well, not all prompts are equal,

right? like there are some prompts that do not need the model to think too much as opposed to other prompts which would need a little bit of thinking. So there's been a lot of uh I guess work happening in the the community as to how to control the amount of thinking that the model does.

So you have things like dynamic uh budget that you will see out there you know uh how can we make sure that the model does not overthink on overthink on questions that do not need too much thinking. So for this you can have something like a quick classifier let's say uh that runs on the prompt and tells

you whether it's something that is kind of a highinking kind of problem or a lowinking one. uh but this is more of an open problem but this can be one solution. So the second one is those LLMs they have a limited context window.

So when the LLM thinks it needs to also be aware of how much context length is left. It cannot think too much also because of that limitation. So you need to also have that context awareness. Uh so there has been some work to also

force the model to either think more or stop. So there is this term budget forcing uh that I think was introduced in this paper uh S1. So the idea here is if you want your model to continue thinking, you're going to introduce some tokens midway to force it to think more. And such tokens are for instance uh

weights. I think there's another solution. Um so actually it's a slide that I have not really talked about. Um so if you look at this reasoning chain sometimes the model will output something like oh wait wait wait uh I think I found something else and typically the model would go again on

another uh kind of reasoning path and this can be one way to incentivize your model to think more. Uh or another term can be uh okay your time is up now my answer is and it will force your model to respond and then if you think about it um

your model gives tokens in its reasoning chain but models may think on some other on some other space maybe not in the language space. So there is uh also a line of work around having some continuous thoughts uh basically having this uh thinking

token actually not be tokens but be hidden representations that can be more meaningful but also more compressed. Uh so you have a bunch of papers on this. So there's one that I that we linked uh which is actually from 2024 but I think even like a few days ago I also saw another paper on that. So it's a very

much research active area of research and I guess just like that I guess we saw that the way that we want to scale our model is with RL. I guess is everyone convinced of that? Did I convince you well with those arguments or does anyone have any

questions on this? And I guess here I want you to take away to have a takeaway which is we want to use RL to incentivize our model to think more if we start from scratch meaning we don't have reasoning chains. So is everyone good with this? Yeah.

Yeah. Kind of. Yeah. Okay. So I'll take this as a yes. So now we're going to see the algorithm that we use to perform that oral step and you may have heard this acronym a lot. So this uh algorithm that we will see is called GRPO and GRPO has been released in 2024

and it has been kind of the go-to RL algorithm for all these reasoning tasks or for these reasoning training tasks. So what is GRPO? So, GRPO stands for group relative policy optimization and it is a an RL algorithm which very much

like PO aims to do these two things we talked about. So the first one is to maximize advantages. And if you remember, advantage is something that tells you whether what you're producing as an answer is better than what you would expect. So

this is the first part. And then the second part is that you do not want to deviate too much from either the old model which is the model at the previous RL iteration or the base model which is the model at SFT stage. So GRPO is also doing the same thing as

PO in that sense. But then there's a key difference and that difference lies in how it computes the advantage. So if you remember PO estimated the advantage by taking the rewards which is at the completion

level. So you know you have your prompt and you have a response a full response and then based on those two elements you have a reward. So what PO did was take that into consideration along with something else that it was training jointly at training time which was called the value

function. And the value function objective was to try to predict what that reward was if we were to continue generating the tokens following the policy. And if you remember the advantage here is actually in the case of PO was something that we obtained based on a

very complex formula that we did not see actually but that's called a generalized advantage estimation that is a method to estimate those advantage and the big limitation with that was that you had to train a value function jointly with your policy. So this was this big bottleneck.

And in contrast to that, GRPO says, well, we're not going to do that. We're going to take a completion. We're going to compute its reward and we're going to compare it with the average of rewards of completions for that same prompt. So I'll give you an example. So let's

suppose we have a math problem. So what we're saying here is we're going to generate multiple completions for that same prompt and for each prompt and completion and the prompt is shared. So for each completion, we're going to measure I guess a

relative um measure of the reward for that completion and all the other rewards of the other completions. So this will give us an idea of how much better or how much worse is it from I guess the rest of the group. And so this is going to be our advantage.

So the big benefit here is that we do not use value functions. We do not use that. The only thing we do is we sample not just one but [clears throat] multiple completions in order to compute the average of the rewards of the group. Does this make sense?

Oh yeah. So what what would you do instead? So the question is why would you do that? Well, the traditional RL algorithms just for reference they have been developed before all these LLMs became a thing. So for instance, PPU was a method that I believe is from 2017.

So these quantities they may make a lot of sense in some setups but maybe not in the language world. And I guess here the idea is let's try to think of something that tells you how good your completion is just in the relative sense. But here I guess what the authors want to do is to not have to have this very expensive

joint model that they have to train and think of another relative way of doing that. So I think that's the high level intuition and I guess here the idea is let's just sample multiple times and see how one response is comparing to the others and then use that as some kind of baseline to to put this reward into

context. So for instance, you may have a math problem that's kind of easy and if you have a high reward for that one, maybe it's because the problem was easy to start with. But if you have let's say um very hard problem, if you have the correct answer, then you want to make sure you're

incentivizing your model to upweight those those tokens much more because if you find a good solution, it's a good solution to a hard problem. So you want to somehow bake that in into your advantage. So that's kind of the intuition. So, GRPO was developed a year ago and a

year ago, you know, LLMs were everywhere. So, this is also taking into consideration, I guess, what LLMs are incentivized to do in some sense. Um, so yeah, I would thinking that way. Does that help? Cool. Cool. Any other question on this?

Well, don't worry if you have questions because we will have a walk through of exactly how it works. So, here we're going to go through the exact same thing but illustrate it. So, in the GRPO case, we're taking a query and we're passing that through our

policy model which is our LLM that we're trying to train. And here what we said was we want to generate not one but multiple completions. Let's suppose G g completions and each of these query completions. So you have G such pairs

you pass them through the reward model that gives you G rewards. And what you want is to compute the advantage which puts all these rewards into their context. So we saw it was uh basically the reward minus the average. But it's actually not exactly that. So it's reward minus the average over the

standard deviation of those rewards. This is how they defined it. By the way, we will see that this it may not be the the best way to do it, but we'll see that in a second. And we use those advantage those advantages to then tune our policy model.

And while we do that we of course don't want to deviate too much for from the reference model. So we have the scale divergence term as well over here. So that is GRPO and we're going to see right now exactly how this worked with PO.

So with PO if you remember you have your prompt you have your query you pass that through your policy model and you only only have one completion and you pass your prompt and your completion. So this pair you pass it through the reward model and this gives you a reward for that

whole completion. Now there's one thing we did not see last time which is more of a implementation detail but we also have a kale divergence term that is comparing the probability of each token with the probability of the token for from the reference model.

And from an implementation standpoint, we also typically incorporate that in the rewards. So we have something like a per token rewards where only the last token has the reward of the whole completion, but then everyone has also a kale divergence term. So that one is not super important

here to like have in mind but it's just good to know that people implement it that way. So once you have those rewards you also have a value function that this one is per token. This one tries to quantify the rewards if you were to continue generating the

rest of the sequence following the policy. And we saw there is this method that we're not going to see that is called generalized advantage estimation that takes in those two quantities and computes the advantage. You can think of it as some complicated formula

and you have your advantage that you use to tune the policy and that's it which is complicated compared to this one. So GRPO you use advantages that are a result of this group computation but then PO you have an advantage that is a result of rewards

and the value function which is per token. Yeah. Cool. Um so what are the models at stake here? So here we have some models that we use that are quote unquote frozen that are not the ones that we train. So for GRPO

we have the reference model that we do the K divergence on and then we have the reward model which we trained in the past and the same is the case for PPU. Now one thing to note is that in the reasoning case we are actually not training a reward

model because we know how to tell whether a solution is correct or not. We actually have a verifiable reward. So in the reasoning case we're actually not having any reward model at all. It's the same for both. Now what is different is the models that we train. So in the gRPO case we only

train the policy model whereas in the PO case we train the policy model and the value function the value model and this is the key difference. Okay so until now we've seen only uh drawings and illustrations. Uh so let's see some math. So you have the GRPO loss function at the top and

the PO loss function at the bottom. They look scary, but we're going to see together some similarities and some differences. So what is one similarity? Both of them they operate on the ratio of the probability of the current policy and the probability of the old policy.

So that's the first point in common. The second point in common is that both of them they try to keep the updates within some region like not too uh wide and they do that with the clipping mechanism that we saw last lecture.

So I recommend that you just like go through these charts that we saw together. you know, when the advantage is positive, how uh the loss looks like uh and when the advantage is negative. Uh so this clipping function just allows you to not make updates that are too big, that are too white.

But now, okay, what is different? So in the gRPO case the kale divergence is actually something that is explicitly part of the objective function whereas for the PO case the scale divergence is typically part of the advantage.

So this is more of a technical detail but like a few minutes ago I had mentioned that from an implementation standpoint we typically incorporate the K divergence within the rewards that are considered in the advantage computation.

So that's one one difference and then the second difference is the way we compute advantages. So we saw that GRPO we typically compute rewards for each completions and then we compare them with the other completions from the group. Whereas for

PPO we use the rewards and the value models. So far so good. I think I have some other things I want to talk about, but before that I just want to kind of open the floor if anyone has any questions. This is very technical by the way, a very technical,

probably the hardest part of the whole class. So, it's completely normal to I guess take some time to digest that. And if no one has any questions, I actually see this as more of an alarm for myself because this is maybe uh I don't know. So let let me know if there's any any questions on this and uh yeah

absolutely no problem to have any kind of questions. Is everything super clear? Super clear. Okay. So just tell yourself that these algorithms they're just there to tune your model in the RL stage. PPU is heavily used in the preference

tuning framework where you try to tune your model to align it with human preferences and GRPO is commonly used for this reasoning based training. So I think if you tell yourself that then it's something and then the second thing you need to tell yourself is GRPO differs from PO

in that GRPO does not need a value function. it actually computes its uh advantages by comparing the rewards with respect to other completions and then the PPO it takes in the reward it takes in the value and then compares the two to get the advantage.

So if this is making sense I think this is already a very good thing. So is this making sense? Yeah. Okay, cool. Uh, I would also recommend to just rewatch the recording. So, we're recording this. Um, this is, you know, very heavy and, uh, can be technical.

So, yeah, just like re-watching it a few times, I think, can help. So, we have 11 minutes before giving it to Shervin. And what we're going to see now is some extensions of the GRPO work that was done last year that people have done in the past uh few months. So this research is going back to early 2025 but it has

gained enough traction for us to talk about it in this class. So if you remember what I mentioned in the beginning of the lecture, reasoning tokens are being charged to you as a user. So you don't want to pay a lot, right? You don't want to pay too much. So you want your model to do what

you want, but you do not want it to generate too much so that you're getting charged for it. and also from the provider sides I guess it's much better to be more efficient. So there is an incentive to see what we can optimize from the output length perspective.

So if you see the training of these models, one thing that you notice is that as you train it in the RL stage, the output increases in length. So here this graph shows as a function of the RL step the average length per response.

So you see like from an empirical perspective that the answer that the LLM is outputting is getting longer and longer. And this is mainly coming from the reasoning chain that is being more and more sophisticated. And when you compare this graph with

respect to how the performance of the model improves, you see that you know this increase here in length is actually correlated with an increase in performance. And you might say okay it's good. But then there comes a stage over here

where the performance so it's on the on the left. the performance of your model tends to stabili stabilize, but then your output length still continues increasing. And so a lot of people have looked at these charts and they're like, okay, there's something going on.

So here what we're going to do is to look at this phenomenon and see how people have tried to mitigate it. So little warning this is also a little bit technical so please bear with me there is one formula that I will try to explain to the best that I can but there

is some amount of math so in order in order to understand what's happening we need to look at the GRPO loss and the GRPO loss is the one that I just mentioned here seems like a very complicated formula but it it's not really a complicated one. I'm going to

just explain in plain terms what this means. So J of GRPO J means objective function. So the objective function of GRPO is to maximize this quantity which is a function of how much your model changes with respect to the old one. So it's these ratios that

you see in the in the slide and you have this clipping mechanism that prevents your updates from being too wide. And then you have uh the kale divergence on the right which prevents your model from being too far from the base model, the reference model. And then you have these summations here.

And the summations here, they correspond to you going through that process for all completions in your group. Because remember, if you have a prompt, you sample it several times, you have several completions. And then you do that for every token of your output.

So here the first summation is over the indices of your group. The second summation is over the indices that are with respect to the token number in your sequence. And so here I guess let's just kind of think for a second. Okay, if we were to swap I'm not sure if you see uh what I

did here. I just swapped the one over length of output number I. I just swapped it here. I'm going to explain why I did that. So if you look at this, this is a factor that is only a function of which output you're in. So if you're in a very long output,

this will be one over a very long output, it will be a small number, right? If it's in it's a short output, it's going to be one over a short number. It's going to be a big number. Right? And the term on the right on the right of this is token specific. So in other words, the contribution of a

token with respect to the objective function depends on the output that it is in. So if the token is in a short sentence, it's going to have a higher weight, bigger weight than in a longer sentence until now. Is everyone agreeing with me? Yeah.

Okay. So with that being said, I'm just going to rephrase what I just said. If you are in a short sentence, your weight will be bigger than if you're in the bigger sentence. Right? Now, let's try to think about this in terms

of of the advantage. If you are in the case of a token being in an output that is of advantage that is positive that means that we would want to upweight the probability of this token happening again much more for short sentences as opposed to longer ones.

And at the same time, you want when the advantage is negative. So it's not you want, it's just that this formulation makes tokens that are in short outputs be downweighted even more compared to when they're in a long output.

And so this is the problem. This is a bad incentive because what you're telling your model is if you have a short bad sentence, it is worse than if you have a long bad sentence. So that's the idea here. So I'm just going to just rephrase what we said until now. The fact of dividing by the

length of the output is incentivizing your model to downweight even more tokens. If the same tokens in a short output, it will it will be downweighted even more than if it's in a long output. So in other words, what you're going to do is to prefer longer bad outputs as opposed to shorter

shorter bad outputs. And this is what people are hypothesizing that is making the output length bigger and bigger. And we're going to see that in a second. So what people did was do something about this. So this one over length of O people wanted to do

something about it. So there is one paper that came out in March DPO quite a popular paper now that actually equalizes these token level contributions and so here this normalization factor is now common to all tokens and there is another paper that's called

uh so I think it's GRPO done rights but it's Dr. GRPO. So I'm not sure how you you pronounce it, but that paper actually proposes to remove the factor altogether. And when you do that, if you compare the GRPO versus the one that equalizes the token

level contributions, you see that if you plot reward as a function of output length, your model will stop increasing its length again and again. So if you actually look deeper um samples that are correct are actually having a length that is

matching with the GRP1 but for incorrect solutions here the corrected policy is having an average length that's that's much lower than the ones from GRPO. So that's the bottom right chart and that is actually making so this adjustment is actually making the

intended um consequence. So that's one very important I think very important one important modification that people typically apply and I'm looking at the time uh in one minute I will just tell you about some other modifications that people do. So

there is a modification with respect to the standard deviation uh that is within the advantage formula that biases towards uh like in terms of the difficulty of the problem because if let's suppose you have a very hard problem most of your completions will be let's

say failures and so your standard deviation will not be super large. So this can cause problems. And then there is another modification that people typically also consider which is having different epsilons. And if you remember that epsilon influences how much you're able to

change the policy from one iteration to another. And the idea here is that if the probability of your token is very low, it is kind of unfair to just give it a small epsilon to grow because this epsilon is multiplied, right? So I'm just going to write that down and then

it's going to be uh shervin uh where is this? Okay. So, so we actually want the ratio of pi over pi all to be roughly you know in between those bounds roughly. So in other words it's 1 + epsilon * pi of old. Right? So if this one is very

low, you cannot really change your value too much. And you don't want to have an epsilon that's too high because you don't want big probabilities to suddenly go to zero. So you want to introduce an asymmetry

between the lower and the upper bounds. Cool. So this was a lot. Any questions on this? Okay, we're running short on time. We're going to have uh some time after the lecture in case you have any questions. And uh with that, I'm going to give it

to Shervin. Thank you for covering all the hard parts. Now it's going to be a bit easier because we're going to see how all of this comes together. Um and in particular we're going to focus at the deepseek papers and exactly how they used all these techniques that Afin

covered into uh building these reasoning models. So what we saw at previous lectures what quote unquote traditional LLMs. So you started from a pre-trained base model where you did a next token prediction on a bunch of text of the internet and then out of this you proceeded to do your

alignments which was composed of SFT and then RL. So like not the reasoning style RL but like the regular one and then the SFT was u like instruction tuning and we're going to see how these newer models are being trained and I think the example of the deepseek R1 paper is a great one because they go into multiple

stages. first into showing how powerful can the RL stage be if you apply the verifiable rewards that Afen mentioned and then based on the observations of like the performance that you get out of it how to deise a full pipeline of getting a super powerful model that they called R1.

So yeah, respectively a proof of concept and then a full reasoning model. Does that sound good? Okay, great. So now let's start with the recipe that uh DeepSc folks use for the R10 model. So they first started with um like a pre-trained model uh like trained on next token prediction on uh like the

latest architectures with all the bells and whistles. So you recall from previous lectures we talked about uh mixture of experts. So they have this and they reuse a trick called multi- latent attenu attention MLA that they had introduced in deepseek v2 and we had talked about it uh as well you can see

in their architecture they use a porm in their transformer blocks so they have um like a typical baslm so they perform uh next token prediction on it and then this is where the fun starts so Instead of going ahead with an alignment strategy that consists of SFT, they just start with this pre-trained model just

trained on next token prediction and that hasn't seen any supervision so far and they apply the technique that Afin just mentioned um on uh reasoning data. So they look at rewards and all they incentivize the model to do is to um increase the rewards based on the output uh like

output answer that the model gives as well as formatting. So if you have your like thoughts think tokens that I've mentioned then uh like the reward on the formatting side would be uh would be given and the paper gives exactly the templates over which they trained uh the

model. So it's a very simple one. um you have like the first sentences that set up the stage that say you know hey you're discussing with the user you're an assistant and then the reward uh that I mentioned regarding formatting is explained in plain text so it says whatever you want to think about just do

it but put it into think um into think boxes uh and then uh you know once you're ready to give your answer you should wrap it under like an answer um basically answer um blocks and what you see here in red is what you replace by the sample prompts and uh and

then at the end you give the opportunity to the model to respond. Does that make sense? Okay, great. And I'm going to show you again a graph that Afin had showed. So it was uh done on R10 where they said that without any prior supervision just having this as a reward increases scores

on uh reasoning based benchmarks. So this one I think is on AIM. It's like math one. And you see that the accuracy improves over time. And you might think, you know, all is solved. It's great. No SFT and we already have the best performance possible. Well, uh, not so easy because

the authors when they looked at the reasoning chains, they saw some issues with it of two kinds. So first when the model was thinking about um like was emitting distinct tokens sometimes it would mix languages and you had also syntax issues and uh you could hypothesize that this might be

the case because you haven't really seen any strong supervision uh just before that and you give the opportunity to the model to optimize anything the anything it wants but it doesn't really have uh like as a background like a strong supervision signal to anchor on. So this is one key

challenge that we're going to see together how they try to resolve it. Um does the R10 process make sense? Okay, awesome. Uh so now that we have seen what R10 tried to prove the the fact that with RL only you can get reasoning level performance now we're going to see how to adjust the

challenges that we have seen into a full uh pipeline. So that one they call it R1 and they start from the same um the same basis. So they start from a v3 base which is the pre-trained model that uh deepseek had trained during their v3 paper. So it was the non-reasoning version of of this model. uh so they

start from it and then instead of starting directly to doing the RL um stage that we have discussed they try to align it in a way that will nicely um like try to alleviate the issues we have seen. So it starts from what they called as cold cold start data. They generated

u like coots and um so the during the r zero stage and these coots sometimes had issues. So they used humans to rewrite some of these so that all these coots are compliant when it comes to formatting you know language consistency and then they used these pairs prompts

and then rewritten prompts as data to train uh SFT on it. So uh you know and I think there was no number given on um on the number of samples given to to that stage but uh from the warning of the paper it could have been several orders of magnitude less than some of the other stages that we have

seen. So potentially in the O of case of of input output pairs. Okay. So now that we have this stage ready, uh they continued with the RL stage that uh R10 would do and then we're going to explore um you know the the reward function that they used. So not only we have this uh

verifiable reward based on the response of the reasoning model uh output that we wanted to have. Uh but also we have the formatting reward and there is something new that they introduced as well to counter the effect of having poor readability in their uh in their thoughts. There was something called a

language consistency reward where they use um a very simple uh like huristic to assess whether the model indeed doesn't mix languages. So I believe it was the ratio of the tokens in the target language in the outputed chain. So they just put that in order to maximize uh the amount of correct language tokens.

Um okay great. And after this first pass of RL they continued on with SFT with a very interesting uh strategy. So they do it as like a larger scale than the cold start one. And now they mix both reasoning and then non-reasoning data uh in order to make the model useful to the

span of cases that you as a user might solicitate the model for. And regarding non-reasoning data, they uh recycled some of the data that was used for their non-reasoning version of the model for V3. So about 200k uh pairs and it covers the domains that we have mentioned during the instruction tuning

lecture. So like a broad array of topics. uh and then what they did is that they added to it a lot of pairs that are directed towards reasoning. So the ratio was 3:1 and then the reasoning ones uh were um generating uh with a method called rejection sampling. So what they

did is that they um they took some prompts covering these reasoning based uh fields and they used the model that had been trained so far to generate a response and then based on the output and on some with some judge they would keep some answers and reject others such that the resulting uh data sets would be

of very high quality. So this is what they call by rejection sampling. It's uh yeah just a fact of filtering out any uh answers that are not you know perfect. And the reason why I guess they did it automatically with like some LLM judges and so on is like given the scale of the data and you know these were u huristics

that that worked pretty nice uh on that. You had a question? No. Uh, okay. So once they were done with that, they uh went on to a last stage that was one that you might u that might make you think about the ones that u occur in non-reasoning model training pipelines. Uh so they mix this time not only

reasoning data but also non-reasoning ones. So for the reasoning data you know same kind of reward as we have seen but on the non-reasoning one um you try to align the model on characteristics that make an LLM a helpful assistant and a harmless one. So you have this helpfulness and harmlessness

components of that uh part of the reward. And the harmlessness was a reward that was applied on the whole uh tokens that were outputed. So not just the output because you want the chain of thoughts in the think uh section of the answer to be um to be harmless indeed. And then the helpfulness one was uh more

focused on on what you saw at the user at the user level. Okay, great. And just to give some idea of the results they got. Um so first you notice that on uh reasoning based um on reasoning based benchmarks you have two clusters of result that appear you have all these non-reasoning based models

that have uh some performance and then the reasoning based ones have unsurprisingly uh like reasoning uh like a performance that is much higher. And then the second thing that we observe out of these results is that uh R1 was pretty competitive with respect to closed source models that claim to be

reasoning based and it was a pretty um pretty interesting uh you know moment as Afin had mentioned uh to reproduce such um like such a level of of performance. Okay, great. So I want to finish this lecture on a interesting note of you know let's say you don't have a 600b at your disposal let's say you have a

smaller model but you want to have the capabilities of this large uh reasoning model you know how would you go about it so I just want to give you a reminder of how we had dealt with this topic a few lectures ago when we talked about distillation So at that time we were just talking

about pre-training and then instruction tuning where the data we were dealing with was fixed. So for example for next token prediction you know the text you want the model to fit on. For SFT you have fixed pairs. You know exactly what you want to learn. And what you did was look for each next token prediction at

the output probability distribution of a teacher model. And on your student model, instead of fitting a hard label of the next token, you fitted instead the whole probability distribution of the teacher model in order to distill the knowledge quote unquote of that teacher model into the student model. Do

you all remember that? Yep. So now u you know how could you go ahead with this in this in this case? So here as you have seen we don't necessarily have SFT pairs based on reasoning out of the box. So if you want to distill the knowledge of a teacher model here uh the authors have gone through an interesting

route that is still called distillation but it's another flavor of it. So we use the teacher model here R1 to generate some sample responses and including think thinking tokens. So this is something that is done uh like you know offline and then in a second stage you run uh this SFT and fit

a smaller model on your distilled uh on your distilled model which is typically like much less weights than than the teacher one. So instead of fitting a probability distribution over the next token, you just fit the entire sequence. you just try to predict the same sequence of tokens that the teacher

has outputed. Does this um framing of distillation here make sense? Yeah. Okay. Awesome. And I'm going to conclude here by looking at the results. So you can see that the results once again are very competitive with uh closed source alternatives that claim to be uh like a

smaller version of a reasoning model. So for example 01 mini you can see that the numbers here are competitive with respect to that. And then you could also wonder but why did you go through the trouble of um of like just distilling when you could just like do the same RL techniques?

Well actually uh the authors have seen that at a smaller uh size level distilling the knowledge is more uh efficient in terms of performance than uh directly learning from scratch. All good. And with that, have a great weekend.
