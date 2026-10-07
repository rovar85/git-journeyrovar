# 8fNP4N46RRo

Source: https://www.youtube.com/watch?v=8fNP4N46RRo

Hello everyone and uh welcome to lecture 8 of CME295. So today's topic will be LLM evaluation and I think this class is probably one of the most important classes of this uh quarter because the idea is if we don't know how to measure the performance of our LLM, we don't really know what to

improve and so this class will focus on how we can quantify how the LLM performs in a bunch of different cases. So with that said, we are going to start the class as usual by recapping what we saw last week. So if you remember last week, we saw how our LLM could interact with systems that are outside of the LM

itself. So we saw one core technique that is called rag that allows our LLM to fetch information from external knowledge bases. And so here rag stands for retrieval augmented generation and we saw how we could uh improve the retrieval system. So we saw uh that it was composed of two main steps. So one

was candidate retrieval which is typically something that is done with uh a c by encoder kind of setup. So sentence spurt was uh like a good example of how people would design such a model. Um and so this first step is typically there to filter down the potential relevant candidates for a

given incoming query. And then we saw that there was a second step which was um reranking and that one was a bit more involved and involved cross encoders which were most sophisticated. And we also saw some ways to quantify how well our retrieval system performed.

And then we also saw something that was called tool calling which is the ability for our model to know which tool to call with which argument. So if you remember, if we give our LLM the knowledge of the tools that are available to to it, it can figure out which arguments it needs to input to the

function as a function of the input query and then run that function and then output the result in natural language to the user. And then we also saw how agentic workflows were composed of. So uh spoiler alert is something that is a combination of the two [snorts] previous

methods. So rag and tool calling and in particular given an input we're allowing our model to make multiple calls to call different tools to fetch relevant data from uh other uh knowledge bases and uh we saw one example that was kind of successful uh from the current

applications which was AI assisted coding which relies on this principle And react is typically the framework that people would use. So reason plus act which is decomposing this into observe, plan and act steps. Cool. So this is what we saw last time and we also started from this slide last

time. We, you know, if you remember, our LLM has strength but also weaknesses that we're trying to mitigate. So, in particular, the focus of lectures six and seven were on methods to improve reasoning of the model and ways to for the model to fetch knowledge from other systems as well as performing actions.

And today we're going to focus on the evaluation part. In particular, given a response that the model is giving, how can we quantify how well the LLM is giving its response? Cool. So first of all, I would like to define the term evaluation and the meaning that we will use for this

lecture. So when we say I want to evaluate my LLM, it can actually take a lot of different meanings. So when you say let's evaluate the LLM, it can mean let's evaluate the performance, the output, let's evaluate this based on coherence, factuality. Let's evaluate it based on latency. So

more system related metrics or pricing or how often it is up and so on. So just to make sure we're on the same page, this lecture will mostly focus on the output quality parts and in particular we'll focus on quantifying how good the actual response is. And here you will note that this is a

challenging problem because um as we saw previously our LLM is a texttoext model that can output basically anything. So it can be natural language, it can be code, it can be math reasoning and so on and so forth. So it's very hard to come up with universal metrics to evaluate

that. So we will see how people do this in practice. Cool. So given the fact that our LLM generates free form output, one could imagine that the ideal scenario for us to evaluate the LLM output would be to every time ask a human to rate the response.

So here the ideal scenario would be okay I give a prompt to my LLM. It gives a response. I ask a human to rate it and I start again and again and uh what I do is at the end of the day I just collect all these human responses and I try to quantify the overall performance of my model. Well,

as you can imagine, the main problem is that such a system would be very cost intensive. But let's look at this into more detail. So if you remember the LLM outputs are really free form and there may be cases that even human

judgment may be something that is fuzzy because maybe the rating task in itself is subjective. So let's take the following example. Let's suppose I ask my LLM what birthday gift should I get? And let's suppose the LLM responds with a teddy bear is almost always a sweet gift. Just pick one that

feels right for you. So let's suppose I want to evaluate this response with respect to the usefulness dimension. I may have one human raider that says, "Yeah, it's pretty useful because you know like teddy bear is pretty indicative of um I guess the what the user should get as a gift." But then

another raider may say, "No, actually it's not useful because maybe the response didn't specify exactly which teddy bear. Should I have a bear? Should I have an elephant, a giraffe? Like which stuffed animal should I get?" And so there is this um notion of interrator agreements

where we're bas basically um concerned with making sure that everyone is aligned on how to rate those responses because sometimes like in this illustrative example it may be a little bit subjective. So responses may vary. So what people

want to do is to make sure that the guidelines are clear enough for everyone to rate these responses in a consistent manner. So people come up with um agreement types of metrics. So a very natural metric that you may think of is the quote unquote agreement

rates. So for instance you have this uh two raiders. So what you do is you just um measure the proportion of the time that the two raiders give the same response. And let's suppose the response here is binary. So let's say yes good or not good.

Well do you see a problem with such a metric? like is this a good metric? I guess another way to ask this question is if I give you a given number of agreement rates, can you tell me if it's a good number or if it's a bad number? Well, let's take the example of let's

say two raiders. um let's say Alice and let's say Bob and let's suppose we have two different types of ratings that these raiders can give. So either let's say uh yes it's good so one the output is good or the output is not good.

So if we assume that the first raider gives let's say random responses with some probability P of A for being good and one minus P of A for being not good and then let's say Bob who should have eyes and a smile has uh P of B for being good and one minus P of B for being not

Then let's compute the agreement rate for this case. So the agreement rate is basically the probability that raider A and raider B agree. And so here A and B agree.

if A and B both vote one or way when A and B both vote zero, right? But if they give the their response in an independent and random way, well, if you use like these probability concepts that you know, then we will have

probability of A and B responding to one, which is probability of A responding to one time probability of B responding to one and same for zero. So we will have something like this. So P of A P of B plus 1 - P of A 1 - P of B.

So this one is A and B say 1 and here A and B say zero. So, so let's see what the agreement rate would be in that case. So if we assume that

suppose that let's suppose uh P of A is equal to P of B which is equal to let's say.5 then the agreement rate would be so agreement rate would be so I'm just replacing the numbers here so.5 squared +.5^

squar. So it's 0.25 + 25 which is equal to.5. So what that means is if we're just letting our raers rate these things in a random way with some probability, you know, P of A, P of B, we would already have an agreement rate of 50%. Just by pure random chance. And so

one thing that I want to say is that this agreement rate by pure chance is a function of the probability that each of these raiders give these ratings. And so if this probability is actually higher the agreement rate by pure chance is also

higher. So what that means? So what do I want to say? I want to say that if we just take the agreement rates then it's very hard to put it into context in terms of what you would have gotten if things would have happened just by pure chance.

So for this reason, people have come up with a series of metrics that try to make it more relative to this baseline, which is what would happen if our raiders would choose things kind of randomly. And so you have these metrics like for instance this one is the coins scapa

metric which computes a quantity that is a function of this agreement rate by chance and take the observed one such that if our observed agreement rate is greater than the by chance agreement rates then our coefficient is positive. So

when it's positive you know at least you know it's going in the right direction. So here if the observed agreement rate is equal to one then alpha is so kappa is equal to one. But if our observed agreement rate is below the you know by pure random chance erment rate that we saw on the

blackboard then our coefficient would be negative. So long story short, there is a bunch of metrics that try to quantify interrator agreement rates using these kinds of formulas to be able to make these quantities relative to what would happen if things were done in a random way.

And so that's why you may see a bunch of metrics out there. So here it's cohen scappa that people use for cases where there are tool raiders but then you have extensions such as fly scapa and crypendors alpha that you may see out there. So they all rely on this idea that we should have some baseline

which is you know our raiders just randomly picking answers and try to see how much better our actual agreement is compared to this. So does that make sense? Yeah. So I guess what I want to say is that the first limitation of asking

humans to rate our LM outputs which was sometimes the task being subjective can be something that we can quantify with this interrator agreement metrics. So what people typically do is they keep track of how good that agreement is. And if let's say we have a quantity that's

not satisfactory, people would just hold some quote unquote agreement sessions between the raiders to just align on how they should rate the answers. So that it can be seen as just a health metric to track how consistent your rating are and this is typically

something that people use in practice. So up until now we've seen one limitation of human ratings. Well second limitation I think I also said this previously. So it's really slow. You know, if you ask someone to rate a thousand LM outputs, well, it

will take them a while and it's of course expensive. So, all of that to say that our ideal scenario of asking a human to rate every LLM output is not something that is practical. But we can leverage human ratings in some way because we've seen

that even if the task is subjective, we can have a way to align our raiders. So now let's move on to another way to go about doing this, which is by using some rule-based metrics. So here I'm just going to revise the setting that I mentioned before and instead of asking our humans to

write every LLM output, this time I'm just going to ask them to write the references or the ideal outputs for a given set of prompts. just fix that for good and then use some kind of metric that would compare the LLM outputs

with those references. So here the main difference is let's suppose I have a given set of prompts fixed. Well, I can make iterations in my model and always compare the output of my LLM with this fixed reference instead of always asking humans to rate that again

and again. So, it's already an improvement and we will see a little bit what are the kinds of rulebased metrics that you will see out there. So ideally these metrics should reflect the performance of the LM output in a in an optimal way. And what I mean by an

optimal way, it is to make it be a little bit flexible given the fact that natural language is not always something that you can say in one given way. So for instance when I provide a response to a given prompt there can be very well a case where I can formulate the response slightly differently but it

will still be just as good. So the idea behind this metrics is to make this comparison a little bit flexible. So let's start with one common one that people use in the translation case. So this metric is called meteor and it stands for metric for evaluation of

translation with explicit ordering. So the idea here is to compare reference and predicted and we'll see how it's being done and also penalize cases when words are not in the same order which is explaining why the metric is called with explicit ordering. So the formula is as follows. So it is

some fcore times 1 minus some penalty. So the fcore here is so you may be familiar with f1 score. So it's like the harmonic mean with equal weights. So this one is with the variable weights. So it is a function of precision and recall where precision is the proportion of the

unigs that are in your predicted sequence that are matching with the reference and the recall is the proportion of the unigs in the reference that are matching with what is in the predicted. So it's basically matching the

usual precision recall metrics that you know and then we have another quantity here which is the penalty and I mentioned the penalty here tries to incentivize goods ordering. So if it's ordered the same in the reference and in the prediction then it's good otherwise it's

bad. And so here there's a bunch of quantities. So gamma and beta are hyperparameters that people arbitrarily choose. And it's a function of C, the number of contiguous chunks that are matched

over the matched unigs. The number of matched unigs. So ideally you would want C that would be as low as possible because if you have a low number of contiguous matches it means that your contiguous sequences are are long

which means that the ordering is the same. So you want C to be low and then matched unigs to be high. So you want that penalty term to be low for a good I guess for a prediction that has the same ordering as the reference. So I guess

higher meter score means better translation AC according to this way of doing things. So I guess when you look at this formula so first of all it seems it looks very arbitrary right I have uh alpha as a hyperparameter gamma beta so it's kind

of a a recipe I feel so that's one and the second thing is that it does not allow for stylistic variations because here we're measuring the number of matched unigs Although the metric expands the like range of what is called matched unigs by

taking into account things like words that are synonyms of one another and things that are of the same roots but still it is not like extremely uh satisfactory in that sense. So mter is meteor is one such metric. You have another one that's being used or that has been used in translation

tasks which is called blur which you may know. So, BL stands for bilingual evaluation under study. And you can think of this as kind of a precision focused kind of metric that uh looks at the number of matched the matching engrams over the engrams that are in the

prediction, which is why it's a precision kind of metric. And it also has uh a penalty term here. It's called brevity penalty because given that it's more of a precision kind of metric. If you translate something that's very short, you may be able to gain the the metric.

So you want to penalize the translation being too short. So we'll not go into a lot of details, but I just want to just show you the kinds of metrics that are out there. So meter is one, blue is another one and rouge which you may have heard is also another one typically used for

summarization tasks. Again same idea and um it has a bunch of varants that you may see out there but long story short all these metrics they all compare the output with a reference. So as we saw one key limitation is that they do not allow stylistic variation.

So let's take an example. So let's suppose I say a plush teddy bear can comfort a child during bedtime. Well, the exact same thing I can say it I can say it in a really different way. So soft, stuffed uh bears often help kids feel safe as they fall asleep or many youngsters rest more easily at night

when they cuddle a gentle toy companion. So in all these cases, the metrics that we saw would you would really perform very poorly. So that's one key limitation. So the second key limitation is correlation is not that great. I mean, you can imagine that people have

come up with all these hyperparameters to kind of make it be correlated to human ratings, but they're not that correlated. And the bottom line is it still requires human ratings to just get started. And sometimes you just can't afford to have human

ratings maybe in your project. So I guess there are still some key limitations which is the reason why. So all of that to say I want to motivate the key method of this class or of this lecture which is called LLM as a judge. So, you know, we spent the first seven

lectures motivating these large language models that are pre-trained on huge amounts of data that are uh tuned in a way to match human preference. So, they do contain human knowledge. They do contain some indication of what humans may prefer. So the idea here is to have our model

response be actually an input of yet another LLM and that LLM is something that people typically call LLM as a judge. So it was a term that was introduced in a paper uh from two years ago. So here the idea is to use an LLM for rating purposes

and things that you would see as input would be the prompt that was used to produce the response, the response and the criteria along which you want to grade your response. And so here LLM as a judge would give you the following outputs. So the first

thing is it would give you a score. So here you can think of it as like a binary scale kind of score. So pass or fail but and this is very new also a rationale because LLMs they understand text so they can also explain you why they

graded something with a given score and that part is the key difference with previous methods. we are able to explain why the metric or the model is giving us a given score. And this is quite quite good because in the other let's say rulebased worlds where you would have all these

like formulas and multiplication all these things and sometimes you would come up with a number that would not be very self-explanatory and this is luckily something that LM as a judge addresses. So to recap, what we want is to use an LLM as a way

to grade the response. So here you would have typically the following kind of prompts. So you would state okay I want to evaluate my response with respect to a given criteria and then you give the prompt that you used to generate that response along

with the model response and then you would ask the judge to return two things the rationale and then the score. So one little trick I want to point out is people typically ask the model to first output the rationale and then the score

and the reason why we typically do that is it's something that empirically improves the quality of the results but then given what we saw I think in lecture six if you remember the reasoning class we saw that these reasoning models that are being trendy especially in 2025

what they do is they first output a chain of thought before giving the answer. So you can actually think of this trick as being on the same kind of idea of reasoning models as in it allows the model to externalize verbalize its quote unquote

thought process before giving the score. So it gives it a chance to really figure out what is good or what is wrong in the model response. So far so good. Any questions on I guess the setup? Yeah, all good. Okay. So now I have a question for you.

If I give the following prompt to my LM as a judge, am I guaranteed to have a rational and a score that I can parse? Am I guaranteed? No. Yeah, exactly. No. The answer is no. You're not guaranteed to have um a rational and a score that you can parse

because this model has some probabilistic nature to it with the sampling process and it's not something that you can really control. So I guess my follow-up question is do you know a technique that would I guess guarantee you to have um a structured response. So hint is a it's a

technique that we seen that we saw like towards the beginning of the class. Okay, I'll give you a little hint. So if you remember on slide 65 of lecture 3, we saw a technique called constrained guided decoding. So if you remember the idea here is to constrain the decoding part pro process

by allowing our model to only sample from quote unquote valid tokens. And we typically do that in cases where we want our output to have a given format. So let's suppose a JSON format and we want absolutely that format. So what people do is they use this technique to guarantee the form of the

response. And in case you're using these provider like the providers that are you know out there like for instance open AAI or Gemini or anthropic this technique is known under the name structured output. So in your project if you want to

constrain the decoding process in order to output a response of a given format. So let's suppose my format is a response and I kind of represent it by a class and there are like two attributes so rational and score. Well typically you can reference that with the argument text format equal to

that representation. So, this I believe is something that uh OpenAI does, and I'm not exactly sure if it's exactly the argument name that you would see for the other providers, but they're all I guess along the same lines. Does that sound good? So, the key word

here is structured output. Whenever you want a response of a given format, you would just go for that. Okay, cool. So just to recap, our LLM as a judge has two main benefits. So the first one is that we do not need a reference text. We do not need human ratings to just get started because our

LLM already has a lot of I guess knowledge that has acquired during pre-training and human preferences and so on. So you do not need that. And then the second thing is you can interpret the score with the rationale that is being output and that is also quite remarkable.

So just as an example so here you would say okay evaluate the quality of like this this response. So you would have some rational that would explain what this response has or doesn't have that makes it good or bad along with the score. Okay, cool. And I believe uh Okay, so

now we're going to see the kinds of LM messages that you can see out there. So of course there are many variations but there are generally two types of L me that you will see. So the first one is you have a single output a single response that you want to evaluate

and here you would ask LS judge to say okay is it good or is it not good and the second big kind of LS judge that you will see out there is pairwise kind of setup. So you have two responses and you say is response A better or is response B better and here you would obtain a response

either okay that one or this one. So if you remember we've seen uh in previous lectures that there are a lot of situations where we would want to have preference data. So for instance in the preference tuning class that we had I believe it was lecture five. So this kind of method can also be a

good way to synthetically generate preference ratings where you have two responses and then you ask your LLM to say okay I prefer that one and you can use that one as a as the label to train your rework model. Does it sound good?

Any questions on the setup or everything that we've talked about so far? Okay, cool. Everyone is uh on the same page. So now let's see what can go wrong with our LMS as a judge. So uh let's think of the possible kinds of failures that we can encounter.

So the first one is called position bias and as the name suggests it has to do with the ordering at which we present the responses to our model. So let's say if we ask our model is response A better or response B. Well, there is a chance that the model responds with response A just because it

it was the first one to be mentioned. So that kind of bias is called position bias. So it's where the position at which you place the response matters in the judgment of the LMS as a judge model. And I guess as a way to remedy that, people have different techniques. But

one typical technique would be to ask the model is A or B better and then ask the model is B or A better and then take the majority voting. So if both of them lead to the same response, then it's good. But if the response changes, then it may not be good. So you may want to do something else.

Um there are a bunch of other techniques. So I know there's a bunch of papers that try to tweak the position embeddings but those ones are a bit more advanced. So it's not typically the thing that you would do just out of the box. So taking the average or like you know taking the majority voting of this

you know position swapping is CPT what you would do. Okay, cool. So this was the first kind of bias. The second bias is called verbosity bias. So let's suppose you have two responses and the first response is short and concise.

The second response is something that goes much more into details is typically something that is more verbose. Well, there are cases where the model will tend to um to I guess prefer responses that are just more verbose just because they're more verbose, not necessarily because

they're more correct. And for that, it's maybe a little bit trickier. So people typically try to explicit this dimension in the guidelines when they input I guess the this this question to the LMS as a judge they say uh well make sure to not pay too much

attention to the length of these responses to not I guess prefer something just because it's more verbose. So that's one kind of meth method that you will see out there. Uh the second one is to just um also add some examples in context learning

examples uh to the model to just um I guess tell it to um I guess show by example that verbosity is not something you should uh prefer. And then uh the last one is to have some kind of penalty on the output length.

So you can ask your model in a pointwise way is one how how good is one how good is two and then try to penalize that with the length. So that's something that also people may use. Okay. So we've seen position bias, we've seen verbosity bias, now we will see the third kind of bias that you may see out

there which is called selfenhancement bias. And so that one has to do with the fact that if you ask a model to judge an output that was produced by itself, well, the model will tend to prefer responses that are generated by itself

regardless of whether or not the other one was more uh aligned with what we wanted. And I guess here the intuition is that if our model generated such an answer then it's maybe the case that uh our model thought that from a

probabilistic standpoint this was a sequence that was very much likely to appear. So it may be I guess one way to think about it which is if it has generated such a sequence then it means that it it is something that it thinks I mean think uh quote unquote that it's a good answer.

So the general guideline here is to typically not use the same model that you use for generation and for judges. But um I guess nowadays it's kind of hard to have that strict uh constraints um I guess uh respected because I guess all models

they are trained on basically the same data sets. So you can argue they're all being subject to the same I guess training mixes and so on. But still I guess people what what people do is they tend to use another model just to have such a risk be minimized. So long story

short try to not use the exact same model that you use for generation and for evaluation. So this is self- enhancement bias. Okay. So before we go to the next uh subp part I guess what do you think of these three biases? Do they make sense? Any questions so far?

Yep. So, can you elaborate a bit more? Yeah. Yeah. Yeah. Yeah. So, the question is, can you have a model that just maybe isn't aligned with uh I guess the ground truth and maybe prioritizes maybe one label over another. So, yeah, this can

definitely be another kind of bias. Uh so this bias being that our LLM is not exactly aligned with what humans would prefer. So these three biases are by no means exhaustive. So this can very well be another bias that you can list as well. Um so yeah, this is definitely another kind of bias.

Yep. Yep. So the question is, is it possible that our judge still prefers an LM response even if it's a different one? Well, it depends how good your judge is. But typically the best practice is to have a judge that has a much bigger capacity

that may capture these kind of differences and not be fooled by a response that just sounds like something it may generate but something that is maybe more aligned with human preferences. So I guess the short answer is yes, you can still have such a situation. But in order to mitigate that

risk, you would typically take a model that is not the same but also typically much bigger. So uh you have a bunch of uh such models out there and uh you know with all the I guess um improvements that have been made with like reasoning models. This is also something that people try.

Yeah, question is should the judge be bigger? Um, it's not a hard constraint, but it's typically something that people would take like a bigger model that would have strong reasoning capabilities that could really tease out what's good and what's not good. Yeah. Okay, cool. So, with that, I'm going to

just go over the best practices that we've seen. So we saw that um in order for our LMS as a judge to output a score, we need to give the criteria that we want this to be evaluated against. But sometimes this criteria may be a little bit subjective. So one thing that really works very well is to have crisp

guidelines. So really explicit what we want, what we don't want. The other point is you may see different kinds of scaling out there. So sometimes people having uh a scale that is maybe more granular and maybe other cases where we're just operating on a binary scale. So typically what people would

tend to prefer is actually the binary one because it makes the job of the LM as a judge easier. So it's just either good or bad. And also when it comes to aligning the judge with human ratings, humans, they typically also find it easier to just judge out of two options as opposed to

several. So it just removes the noise of having several uh possible choices. And it's not necessarily an extra signal that may be really useful. So here the tip is to use a binary scale like a pass or fail kind of score as opposed to like a gradual one. The third tip is to make sure to output

the rational before outputting the score. And we've seen this is along the same ideas of outputting a chain of thought before providing the response which is something that is done by our reasoning models. So it's typically something that will improve uh the judge performance.

Uh so we've talked about the different kinds of biases. So position, verbosity, self-enhancement, but it's not the only ones of course and uh I guess people typically also look at how to mitigate those with the remedies that we mentioned. So, so far we've stated that we do not

need human ratings to get started, but a good practice is to still look at how the LLM ratings compare with the human ratings. So here one tip is to just calibrate the responses that the judge is giving with respect to the human ratings because at the end of the day it is the quantity

that we want to approximate and so here I guess if there is the budget and it's something that is possible for the project one good uh practice is to collect the human ratings output the LM as a judge scores and then run some correlation analysis. this to see if there is something that can be uh

improved in terms of the prompt mainly the prompt and then the last thing is the temperature. So if you remember the temperature um is a parameter that you can tweak to make your generation more deterministic as opposed to more creative. And so you

will see that for evaluation tasks, people use a low temperature because they want to make their evaluation experiments reproducible. Like let's imagine you do one evaluation and then you do another one let's say uh two days later. You don't want the scores to be super different. So you

will see a temperature value of something [snorts] like 0.1 or 0 2. These are like very uh common values that people take. And so long story short, if we were to recap, we went from the ideal scenario being that each LM output is rated by humans

to actually having some kind of approximation with these LM as a judge models that can do this evaluation I guess um without any constraints or without any need for human judge. ments. But as we mentioned in the best practices, making sure that the LMS adjust scores

and the human ratings do not diverge is something that we should keep in mind as we improve our model because it may be that we're improving on our model so that our LMS score is very high but the LMS score is itself an approximation of human ratings. So I guess you don't

want to overoptimize against the I guess a proxy. And so that's why you want to have that proxy be as aligned as possible with your ground truth labels which are human ratings. Okay, cool. Um so uh we have a few minutes left before giving it to Shervin. So I'm going to quickly go over

the kinds of dimensions that people uh measure uh LM output against. So we have broadly so there are many dimensions but just to simplify things there are two main dimensions that we can look at here. So one is how well your task is uh being done. So task performance with things like was the response useful, was

the response factual, was the response relevant among other things. And also how aligned was the response format in terms of tone is in terms of whether the style was something that is aligned what we want in terms of whether there was any unsafe elements of response that was given to

the user. And I just want us to spend maybe five minutes on the facility dimension which is actually something that requires a little bit more work and I'll give you just a setting. So let's suppose we have some text output

and our goal is to quantify how factual that output is. So I'm going to read the text out loud. So teddy bears first created in the 1920s were named after President Theodore Roosevelt after he proudly wanted to shoot a captured bear on a hunting trip. So what we want is quantify how factual that piece of text

is. So I told you pre previously that um we typically prefer binary scales when it comes to rating uh something with respect to a dimension. But the thing with factuality is that there's a lot of nuance.

Some text may be very wrong. Some text may be a little bit wrong. Some text may be not wrong at all. So we want to capture how wrong the text is. given the the fact that the text can contain a lot of sentences and if there's like one small issue, we don't want to just say the whole thing was not correct.

So, I'm not sure if you saw in this text, but there are actually two errors. So, it's not 1920s, but 1900s that the teddy bears were first created. And uh the president didn't want to proudly shoot. He actually I think refused. So if we are in such a case the question that we want to tackle here is how do we

want to quantify this nuance. So this is an open question that people have been writing papers on. So what I'm going to tell you now is something that people typically use nowadays based on re research that has been done.

So we typically operate in a few steps. So the first step is for us to go from the original text output to a list of facts because when you look at a text, it actually contains a lot of facts that need to be checked. And so the idea here is to aggregate

the factuality of this text along the dimension of the facts that are present in this text. So in this example, we would have one LLM call that transforms our original multi-sentence multiaragraph potentially text into a list of list of facts. So here in

this example we would have four facts. So that's the first step. The second step is we would go over each of these facts and check whether it is correct or not. And so here we would typically proceed in a binary fashion because when if you think about it a

fact is either correct or not. I mean you may have some in between but we don't want to over complicate the ta the task and so here the factchecking process would typically involve the other technique we've seen last lecture like rag for instance given a piece of text

we want to I guess query a knowledge base with the actual fact and then check whether the fact that is here is actually correct So this facteing process is typically something that involves things like rag web search is also something else and so on.

So you can think of this facteing step as also involving LLM calls. And so you can also think of some facts being more important than others. So as an example, maybe the fact that the president proudly wanted to shoot the the bear is not as important as

let's say the name of the person after which the teddy bears were named. So you can think of also having weights that quantifies the importance of each fact. So people would use something like this formula which is an aggregation over all the facts with some

weight that quantifies the importance of each fact. So these weights alpha I can be all equal to one another if you want to make it simpler. It's not something that is necessarily uh the case everywhere that these must be different but it may be something

that you can tweak. So if we go back to our uh initial question which is how do you quantify the factuality of this text here you would say okay the second and the third facts are both correct. we know how important they are. So we run this aggregation formula and we obtain a

score of 6. So that means that there are some errors but we still have some things that were still factually correct. So this is typically how you would run this criteria with I guess the techniques that we have nowadays. Okay, cool. I know I'm 2 minutes late

and with that I'm going to give it to Shervin. Thank you Ashin. So before we move on to looking at specific benchmarks, I wanted to take a detour and look at what is happening on the agent side of things. So if you recall what we discussed uh

last lecture, we talked about this react framework where you could decompose what was going on within an within an agent into specific steps. So it's usually three steps can be observe, plan, act or it can have other names. But the fact is that you have several atomic steps that can loop.

So if you take a look at the typical agents inner working uh you can see a pattern like this. Now you might wonder how do you even evaluate such a thing. So let's take a look at just one loop um and then let's see together what can the errors be in order for us to have an idea of what would an evaluation results

mean on an agentic workflow. So I'm going to show a slide that we had presented um at the previous lecture and uh we had seen that we can decompose a tool call into these three steps. So let's take our favorite example um let's say you want to find a bear near you. So you

would ask that to the model. So the first stage is to find the right tool call with the right argument and then once you have found this right tool call you need to execute it and then based on your tool call prediction and on the results that you obtained from your tool you would infer the

results at the last step. So these are three steps and you might have a series of them in the case of an agentic workflow where you call multiple tools and then build up your reasoning until reaching an answer that you then give to the user. Okay. So now let's look at

what can the failure modes can what can they be at each of these steps. So first let's take a look at possible tool prediction errors. So the first one I want to mention is the case where the error is that from a user query that obviously needs a tool that you don't actually use the tool. So here let's

suppose that you want to find a bear. You have the tool to find bears at hand but you don't use it. Uh so typically if you don't use it a possible behavior from the model can be to uh say an error. Um so an error by an error I mean you know sorry I cannot do that and this in assistant terms you can call this a

punt. So when you don't answer the question you just fail. Uh it's called a punt. So you might punt here. Uh you know sorry I don't know where I can find one. and let's see together what could possibly cause this issue and how we could remedy it. So I don't know if you recall the

concept of tool router or tool selector that we had introduced. So usually when you are dealing with tools you don't have just one you have multiple ones and the number of tools that might be useful for a large scale in the sense of number of users LLM might be large. So you don't want to input all the function

APIs at every call. So it might be the case that you have this intermediary step where you filter down the sets of possible functions that you can put in the preamble and here um like these tool selectors or tool routers um they have the property of trying to

be recall oriented. So you want to trim the list of functions that you want to input in the preamble u but you want to at least find those that you need. So the main property here is that you want to save on uh context space but you still want to ensure you know most of your use cases are still

working. So this is why here when we say tool wer error we actually mean a recall error. So it means it's possible that we just didn't select the right tool among the set of tools and uh let's say this is the cause then it's pretty clear we just have to adjust the tool router in order for it to be um

like predicting the right tool. So this can be one kind of issue. Another kind is, hey, actually the tool was included in this list of function APIs, but it's just that the LLM didn't think about using it. So, um, so maybe this like fine teddy bear was in there, but we just don't use

it. The LLM directly outputs a response. So in that case um if you recall we had mentioned techniques to teach an LLM to use a tool. So you would need to revisit that part and either so if if you had trained it with SFT so you know include this pattern maybe to train the model to recognize it or if you had done prompt

tuning then you should revisit your prompt in order for this call to make sense to the model that you should use that tool. Okay, great. So this is one kind of uh possible error. Another one that you might see in the wild when you want to debug uh agents is at the time of tool

calls. It might be the case that the model comes up with a function name that just simply doesn't exist. So here I mentioned the tool hallucination. This is what I mean by that. So it calls a function that is just not defined. So here our API was called if you remember find teddy bear.

So this was the function that existed and in this example of failure the model tries to call the function find bear which I haven't defined. So uh when you see such errors you have several potential causes. One of them being that the model simply doesn't ground well overall and typically it

occurs if the model is too simple. Uh so it's an empirical observation if it's too weak. Maybe it can make up things that it thinks uh can be reasonable but it doesn't actually ground on your instructions. And here I have no better remedy proposal than to maybe upgrade the model

if you see that this is truly the case and then see if this uh this is reproducible. Some other potential causes could be coming from actually you. So the model is trained on very high quality data during its SFT stage. So it has seen what great APIs look like. So these

tools that you define that help the user achieve what they're looking for might not be written in the best way. You know, if you didn't use uh AI assistant coding, let's say um or yeah, you don't necessarily have to use AI assistant coding to write this, but these are typically a great way to check whether

your implementation makes sense from a model standpoint. And if it doesn't then a typical remedy is to either like renaming the API just the function name and the arguments just go a long way because this is what the model will see when it comes to your to your tool call. It sees the API

um you know function name. It sees the arguments and the highle descriptions. So these are your three knobs to tune in order to make it sound more logical and then linked to the actual task at hand. And then uh so you know at the very beginning I was saying maybe the model is too weak but actually maybe the first

thing you should check is whether the horizontal instructions so horizontal across tools whether these are clear enough. Maybe [snorts] uh the model hasn't really um understood that it needs to use functions that are given to it. So maybe it's just making up function names that it believes could

have access to. So the first thing to check would probably be to see if this phenomenon is generalized and see if these horizontal instructions they are concisely saying that you should uh make sure to use available functions and then uh yeah on that you can iterate on these top level instructions and uh

you know maybe iterate with uh with an LLM itself because typically top level instructions they're veryant important. So you need perfect formatting and perfect logic. So yeah, typically being able to detail them um with with great detail is is helpful. Um okay, now let's see a third possible

failure cause. So let's say you have your model and your uh user prompts, but you just don't use the right tool. So here if the user says find a bear near me, one other reasonable approach would be you know what if you just send a message asking for a bear. You know that would be reasonable, right? But maybe

that's not what you want to implement as a behavior for your user. So in that case it's not clear to the model what approach you prefer and it is uh on your um you know it is your responsibility to ensure it is indeed clear. So um and then you have to do that at two different levels. So the first one is

you know potentially also at the tool router level. Maybe the tool router doesn't know that for this kind of query, you should have the tool that you had in mind as part of the results. So it's possible that you have a recall issue that you need to fix. And then the second one is simply going back to the

APIs of both functions. Maybe they conflict in scope. So you want to go back to each of them and be precise into which situations should be dealt with with which tool. So being very um very precise in in these APIs um just plays a lot here. Okay, great. So now we're going to go

through a fourth u and last failure mode for this tool prediction task which is what if you have the right tool but you just don't have the right arguments. So you have already gone one step you know you have found the right tool but then this last mile of making sure that

the tool is run with what you would like is not fulfilled. So here if I say find a beer near me and it outputs and and it uses the coordinates 0 0 which is u somewhere in the southern Atlantic so it's not likely that I'm actually there uh you know that can reflect an issue and

you know one possible explanation for this is that maybe simply doesn't know where I am because I haven't specified in my query that I'm here at Stanford and it just tries to make up my coordinates. So, one uh thing that you should uh double check is making sure that the context uh carries the location

information. So, if I haven't provided that as a setting on my LLM map, it's possible it's not there. Um, and uh, and then let's say it's not there, maybe you would want to introduce a location finder tool that is executed beforehand and if it fails because I haven't given the app the permission to see my

location, then maybe you could have a actionable error shown to the user uh, instead of having some dummy parameters passed in. So this is one potential remedy. And then the second one is uh you know maybe it sees arguments but uh the model just doesn't know what it should put as input.

So that that could also be um you know another reason and then on that you know this is a common remedy to go back and then retrain either the model on how it uses these tools or rewrite the API. So we have seen four ways to I mean four failure modes for the tool prediction step. Now we're going to see two more on

this tool call step. So the first one is you know very simple one um you know from a mindset perspective. So know maybe your your tool just doesn't output the right response. So, it's a very um kind of vague category. And as an example, maybe uh your code logic has a bug somewhere

and it it it just returns an error. You know, those that you see in Python, maybe it hits some value error or like anything else. And I just want to say um that it might not be necessarily the case that hitting an error is bad because sometimes you know in the case of finding your location

if you haven't uh provided your permission to find the location maybe it will hit an error and the model will anchor on that error to convey the status to the user. But in general, it's not really common practice to return errors just because the model could interpret it as an internal tool error.

So sometimes when you you hit an error and then you ask the model to synthetize the tool cause it has seen. Sometimes it just says, "Oh, sorry. I couldn't do it, but it's my fault. It's because I encountered an error." Doesn't really say, you know, actionably what happened. And instead the fix here is to uh convey

these outputs in a meaningful manner. So uh typically you have a structured output and you return a true output instead of an error. So uh yeah here um so it's a general case just to say that just check your tool implementation. So you have the right arguments you you have the right

tool but you just don't have the right value. So just a software engineering problem, just go and fix the tool. And the second category of issues that we see at the backend level is when you return no response. And returning no response is often bad when the tool is one that performs an

action. So let's say last lecture we talked about uh increasing the thermostat for your teddy bear who was called. So if you increase the thermostat and the tool doesn't say anything. So the model doesn't know if it has done the task successfully or not. So it could well

come up with a false confirmation of hey uh you know all is good. I have increased the thermostat. No worries. But it actually hasn't. So this is why a common guidance is to always make sure that tool calls are followed by a meaningful output. So uh as usual you have this like structured message and

you should take advantage of it to convey what has happened as part of your tool um in order to make sure that the the model in turn knows what to convey to the user or knows how to continue that agent tick loop. So yep. So always output something and let's say you're finding you want to

find a teddy bear and you haven't found any then here you will be surprised by what I say but it's actually better to output an empty JSON than just outputting none because an empty JSON could mean I found no bears but an output of none doesn't say anything. So even in that case an empty output in the

sense of you know empty JSON is meaningful and make sure to use that meaning in the way you encode your tool. Okay great. So we have seen uh two more u possible errors at the function call level. Now let's suppose that everything went great at the first step everything went great at the second step. So you

have found the right tool output but now the model has trouble to synthesize the output into a meaningful response. So yeah let's suppose your tool found a bear named teddy and then the other attributes which I haven't shown here maybe say that they are like one mile away from me. So yeah the teddy bear has

been found and we just have to present it to the user. But uh if you put it to the model, let's suppose the model says, you know, I didn't find any bear. So what could be the cause here? So it could be the case that you have an output that has information that the model doesn't ground on. So it could be

the case that just the model lacks the ability to refer to content that it that was uh you know put previously. So here I have this the same um vanilla suggestion of um you know upgrading the model. So usually that doesn't happen really anymore but it used to in early

iterations of LLMs. There is uh you know one that is actually one that happens fairly often. So sometimes the tool back end returns not only an output but a lot of output and it's too much for the model to properly parse what is important. So you have maybe the information of Teddy in

there but you know it's it's it's drowning under um an ocean of other kinds of information that are not useful. So the model cannot distinguish what is helpful. And then the solution for that is to go back to your tool implementation and ensure that whatever you output is meaningful to be used to

the model in the next stage. And uh I think this goes um so this overlaps with the third reason I put here. So let's say your output is trimmed already. Then another possible explanation is maybe it's not being presented in a meaningful way. So this is why in Python you have these classes

where you can uh instantiate attributes so that the output is very meaningful. So let's say for like saying that you have found a bear, you could return an object called teddy bear with attributes name, distance and so on. This is very meaningful as opposed to maybe raw information that it doesn't know how to

interpret. Okay, awesome. So we have seen here seven different failure modes over all these categories. So these are not the only ones you know I I have just mentioned those that I see very often that I thought could be helpful but you could definitely see other failure

modes. Um does this make sense? Do you have any questions? Okay, great. So we can move on um to uh summarizing what were the common trends in uh these failure modes. So often times we have talked about the modeling side where uh you know

sometimes in improving the model's ability to reason and ground could be the solution. Another um you know another kind of complaint that we have seen is uh the relevance of what we put in the context window. If we improve that relevance maybe it gets better. And on the

modeling side one more um aspect is maybe the tool wrers modeling or the tool API modeling itself either by SFT tuning or just prompting or even just the API description itself. So you know does the function make sense? Do the arguments make sense? Does the duck string make sense? So this is one kind.

And the other kind is the tool itself. So maybe it just has a problem. So you need to fix it. Um and I just want to say that when you deal with tools and evaluations, you have a lot of possible errors. So one thing that will help you to navigate through this is to be very methodical

into categorizing kinds of errors and then dealing with them in group. So you see there's lots of errors and every time that you deal with a given loss, it may be just an adventure to solve. So really being very organized here is going to help you a lot. Okay.

So with that in mind um we can delve into the world of benchmarks. So we talked about evaluations. Now you might wonder how can you evaluate a large language model uh you know let's say you have trained everything you know how can you compare it with respect to others. So we're going to see together a series

of [snorts] benchmark categories that today's benchmarks usually um you know where where today's benchmark usually resides. So in one of these um and we're going to see examples for each of them. Does that sound good? Awesome. So we can start with a kind of benchmark that I called a knowledge

based benchmark where we want to test if the model is able to restitute um given facts. So um so yeah these facts are typically spanning uh lots of domains. So it doesn't have to be super precise on a given domain, but it's like spanning like all the kind of domains that your users may care about. And then

one prime example for this is MMLU that we're going to see very soon. But just before we do so, I want to say that this knowledge benchmark mostly but not only measures how well pre-training was done. How well the information in your large corpora of data was retained by the model in order

to be helpful at inference time. So, MMLU stands for massive multitask language [snorts] uh language understanding and this benchmark has um like almost 60 different tasks that are super diverse. So it's not just uh you know one specific topic is just a bunch of topics like everyday life topics or

very you know for example is there are like law um you know medicine and everything that you can think about and the benchmark is redacted in a way that can be easily um you know measuring an LLM's performance and weighing that performance with respect to others. So

it's not something that is free form is something that is um very constrained. There is a question and then you have four possible answers and you ask the LLM to choose one of them. So it's a bit like CME 295 exams. you know part of the exam is also multiple choice questions and you know it's a good way to

standardize the you know evaluation and it's the same that is used here. Uh so here um and this is also a trend that you see across benchmarks. You don't ask the model to just come up with some answer and you have maybe an LLM as a judge just giving some its opinion about it because doing so introduces

um you know another layer of potential errors. You know the LLM as a judge as a mentioned isn't necessarily perfect. So this framing enables us to to have a hard-coded way to extract the the answer output by the LLM. So typically you would ask it to output the the right letter at the end of each question which

you can then extract and then compare with respect to the answer. So giving some examples that what is about what is in this benchmark. uh as I mentioned you have all sorts of fields uh in there and you will notice that each problem uh mostly requires some prior knowledge

about that topic so it's not like purely logic that will help you solve it and I think the last example in this slide is a good representation of it where you have something in the domain of medicine and you have a bunch of numbers uh you know patient has this and What would you say like where would you

say is the damage? So it's typically something that you could see in medicine books maybe and the same goes with other fields such as law where everything has been codified somewhere and you need the knowledge of that somewhere in order to answer the question. Okay, great. So this is the first kind.

Um and it's not the only kind of benchmark you have. Um so it's not the only benchmark in this category. You have other benchmarks that are uh that can be in this category but it's just one of them. A second category that you might see are are those that are in the reasoning

space. So typically uh these are kinds of benchmarks that require some amount of thoughts before outputting an answer. So it assesses the quality of the chain of thoughts or if you are in the reasoning world maybe the quality of your think tokens

but just more broadly your ability to infer um a response based on some reasoning and then for that I'm going to mention two examples. So, one in the field of math and then one other in the field of so-called common sense reasoning that is anchored in everyday life. Uh, which is typically

the field that might be of interest for your LM users and we're going to see that very soon. So, first let's take a look at the benchmark focus on math. So how many of you know about AIM? So, AIM is uh an exam that high school students um sit for when they want to um participates to like the Olympiads and

it's typically um it's it's a very hard test and it's covering math topics and um and then it's in a format that is LLM friendly because you have uh a given problem statement and at the end you ask the student to write the response into a three-digit uh a three-digit number. So, it's very

well constrained which makes it a right fit to benchmark LLMs and uh you know just like the one before it's hardcoded and you know I give here some samples of the AIM exam as seen this year. So as you see, so I don't know if you can read from afar, but it's not super simple.

You you have some, you know, one sentence. So you think maybe it's easy, but you actually need to write down the reasoning before finding the answer. And this is what we want to test the LLM for. And then the second kind of um reasoning that we mentioned here was so-called

common sense reasoning. And the one that is often used these days is um PAS. So physical interaction question answering. So these are tasks that are deeply grounded into the physical real world. So we have some samples at the next slide that we'll show. But it is uh you know still reasoning based questions but

that will rely on your understanding on how things work around you not nec necessarily math based but just you know everyday life and uh this time it's not multiple choice questions over four answers like MMLU it's over two only and you have 20k examples And then here

a good example that I really liked from the samples mentioned in the paper uh was how do I find something lo I lost on the carpet. So there is one solution that says you know vacuum with a solid seal and the other one is vacuum with the hairnet and of course when you vacuum with a

solid seal then the seal is of course solid so no air can go through it. But if you have a hairet, you will vacuum the whole thing and the thing that you lost will be caught inside of it. So what I mentioned is common sense, but it might not be obvious and this is what we task the model to resolve.

Okay. So then one other major area for benchmarks is coding where uh we want to probe the model for solving uh complex questions in coding and um this has two main uses in real life. So one is aligned with the kind of use case that I mentioned at the end of last lecture the one I liked regarding AI

assistant coding. So these models they aim at being used in that setting as well. So you should make sure that these benchmarks perform like these benchmarks show that these LLMs perform well in order to be useful to your users. And then a second reason why uh

benchmarking on coding makes sense is that you have all these tools that you might want to use in an agentic setting and then these tools are written maybe in a Python format. So you want to ensure that your model has uh the right ability to read and write code so that it can execute these tool calls and then

interpret what's coming out of them. So these are two I would say motivations that um that motivate us to like you know find coding useful here you know even to the to the folks that don't do coding at all. So um yeah and then one example of such

benchmark is SWEBench. So SWEBench is so I put a question mark here because they didn't define exactly you know what the acronym meant but it's likely that it meant software engineering benchmark. to Swiss, often times the acronym for software engineering.

And what they did is that they looked at popular Python repositories, and they filtered down those that contained pull requests that were solving an issue and that introduced tests. So you have some before after behavior that you can quantitatively assess with the tests that are

introduced. And supposedly if you have a pull request that introduces some test and some fix, you can fairly assume that these tests were not passing without the fix and that they are passing after the fix. So the fact that we have these tests at hand is a good measure for us to assess the quality of a fix.

So if you have heard of a testdriven development, it's all about you know having tests and ensuring they pass and this is what it relies on. So uh yeah and then here uh you ask these LLMs to solve these GitHub issues and then you assess whether they indeed uh pass by uh by looking at the test

status before and after patching the answer suggested by the Okay, great. Uh so here is a very nice um figure that the paper introducing that benchmark gives. So you know you're given a code base uh and then what you ask the model for is a patch that is just it and then uh you patch whatever

the model has provided to find the tests. So to find the test status and then one last area that I want to mention in the case of uh like base benchmarks is safety. Uh so when you see uh fancy LLMs coming out you usually don't see in the you know advertisement of modeling

benchmarks the safety part because usually safety is is a bit subjective with respect to the LLM provider. So every company has its own policy. So you cannot necessarily compare a performance on a given benchmark across models just because all

these providers might not claim they want to perfectly solve that benchmark 100%. As a result, it's not necessarily a good measure of that field. So if you look at model cards often times you see a safety section being mentioned in reports to say the work that they have done but

they don't necessarily compare models with respect to a given benchmark. Um and uh yeah, usually the safety benchmarks they are fairly aligned with what we think um you know should or should not happen. But on top of it you might have additional policies that maybe uh you know just policies. So you

have some human that had to make some decision. It might not be a universal decision. It's just a given decision. So the benchmark the benchmark's goal is to be aligned with what kind of policy the LLM provider has in mind in order to be truly meaningful and yeah this is why when you execute a safety benchmark

you should check the content of the benchmark in order to put a meaning behind it. So here let's talk about harm bench which I am supposing it means harmful behavior benchmark. So this benchmark has four categories. The so-called standard category that is um categorizing

uh like quote unquote vanilla harmful behavior. Then you have copyright category that is uh assessing the model's ability to generate copyrighted content which we do not want. And then the two last ones contextual and multimodel it's like both of them are contextual based on a given modality. So

contextual is on the the text modality and then multimodel is with like other model modalities than text. So we're going to see an example at the next slide. And here you don't have the same ability to assess performance on this benchmark

based on some hard-coded match because these harmful statements might be open-ended. And you cannot possibly just solve all of these by regex matching. You know, for example, one example in the standard category of this benchmark tries to uh entice

harmful behavior um into like executing something that is harmful and um the paper mentions like makes a distinguish uh distinguishes something that is very interesting. So it distinguishes model quality with safety by saying that if the model tries to do the harmful behavior even if it wasn't successful

because it was not of a good quality enough then it's enough to count the attack as successful and then for that they trained some classifier to recognize these cases and yeah this is the only benchmark uh among those that I presented here that is done based on a classifier that

can itself be prone to error uh compared to others that are very grounded in uh constraints setup values and as promised here is like a few examples as mentioned in the paper. So uh here uh you know we test whether you can unlock a door that you shouldn't unlock and then here um the yeah the

test is on influencing someone with respect to some election. So it's not these are not safe behaviors and yeah okay great so I mentioned everything uh so far that you could solve without tools. Uh so of course I say you could you know some of them you could use tools of

course to solve them but what about uh measuring the behavior of agents. So for here you have an interesting benchmark called toao bench where toao is a Greek letter that actually um you know you can write it as tool agent users and this is why we say toao and um it's a benchmark that provides uh across

two different fields so the airline and the retail field a set of tools and it gives a set of policies is you know things that the agent can and cannot do and then what you do is that you have a set of tasks. So tasks are problem statements that you give um given user and the goal is for the user to achieve

that task through the agent. And the interesting thing about TaoBench is that Towbench is language model simulated. So the user interaction with the agent as you can imagine cannot be hardcoded because further turns will depend on previous ones. So let's say you say something as a user and your

agent decides to do something. Then you need the context of what it has done in order to continue the conversation. And this is why you have the simulation aspect that the paper introduces that is typically done by a separate uh big model that plays the role of the user.

And uh yeah, here we have an example of the task of changing a flight. So you have a given tools, the agent tries to help the um the user to achieve that goal and uh at the end of it we assess whether it's successful in doing so by calculating a reward that's a function of the database change. So let's say the

user has changed their tickets. So we want to see if the database has indeed the state that we're looking for and or a given action. So maybe the action of cancelling is one that is the goal of this task. Uh so this is like part of the reward. And the paper that introduces this

benchmark uh talks about a concept that is um funny word play. Um with respect to the metric that we had that we had talked about at the last lecture, we had introduced pass at K. And then this paper talks about pass hat K which is the probability that all K attempts succeed and then why is that uh

relevance metric here. So as you have seen the airline and retail um domains were ones that were chosen chosen here and then an an agent in the loop here could be a way to see if automating the agent side of things could help. And in order to truly know whether it can help you want to have reliability and

consistency in mind. So if you execute the the task k times, you don't want like pass at k the probability that at least one of them succeeds. You want the probability that all of them succeeds which is why this metric matters. So if we had more time I would have derived the formula to find

um pass hat K with respect to the um parameters of the problem but I will refer you to the derivation that Afin has done last time and uh yeah I just want you to be convinced that this is indeed the formula. So if you're not convinced, please feel free to do it um at home.

And moving on, we talked about all these benchmarks. Now let's see how they are grounded in reality. So by now I think everyone of you has seen the new Gemini launch a few days ago. So this was the report that was sent to everyone to to just justify that the performance here

was better. And you can see that what we introduced here is mentioned in some format. So the reasoning part on aim and pa is there. And then you will see that some of these benchmarks are derived in a flavor that introduces um multilinguality linguity um multi- languages and uh so this is the case for

pika instead of p global pa and then for coding it uses a flavor of swbench and tool use it uses also a flavor of bench which is towel squared bench And a few last words here. I just want to say that benchmarks are here to characterize the profile of of your LLM.

So it's not all good or all bad. Maybe some of your LLMs will have some strength and some weaknesses. and your personal experience might guide you to use one specific one with respect to others in given situations. So if I had to just give my personal experience, I know that the Sony models are very

helpful for coding and whenever I want outputs that are fast and cheap, you know, Gemini flash is usually good. But these are not by any means global recommendations. you know, your own use case and your own experience can guide you into having a profile of models that suits your tasks best.

And you can interestingly plot the performance of your models with respect to the other dimension that you care about which is price for example and see for a given price what is the best model you can use. And then the border that you see on the best models for that

specific metric is called the parareto frontier. And you might have a parto frontier with respect to several aspects. So cost, safety, context length. And then few words regarding data contamination. One thing about these benchmarks is that

they are as good as the assumption of whether you have seen the actual benchmark results or not. So make sure you haven't seen them. And for that people introduce hash values. uh you know in the case of tool use they introduce a block list in order to not access websites that might contain the

responses or uh in the case of math we have the luxury of evaluating on new tests that the model has for sure not seen and a good heart's law is a very good um adage that says a measure when a measure becomes a target it ceases to be a good measure

So all these benchmark results are to be weighed against what you're truly looking for and then these benchmark results don't necessarily tell you whether a model is good for you or not. So um you know we had talked about chatbot arena um in what one of the previous lectures it can be one way to

balance the real life um performance of these. But I would say ultimately you should be the one trying out these best models and see for yourself which one corresponds to you best. And with that I hope you all have a great Thanksgiving and thank you
