# Q5baLehv5So

Source: https://www.youtube.com/watch?v=Q5baLehv5So

Cool. Hello everyone and welcome to lecture three of CME 295. Um so today is a very exciting day because we're going to finally introduce large language models. Uh but I guess before we go into that, I'm just going to start traditionally

with some announcements. Um so some of you wanted to have the slides before the class. So just a heads-up that in case you want to use the slides to do some annotations, uh they're on the website right now. So feel free to get them. And we Shervin will try to just on a

regular basis every Thursday evening have them published on the websites so that you can download them and annotate. Cool. So with that, let's start. And as usual, we're going to recap last week's episodes. So if you remember, you know, lecture

one and lecture two were all about introducing the concept of self-attention and linking them to the construct of the transformer. And what we did last lecture was look at all the types of models that there are out there and how they were all based on

the transformer. So there are three categories, three main categories of models. So the first one that we saw was encoder-decoder model, which basically relies on the transformer. It has the encoder of the transformer, the decoder of the

transformer, and typically the tasks there are input text, so text in, text out. So we saw that one example was T5 and all the variations. The second type of model is where we remove the decoder from the trans- transformer and we obtain an

encoder-only model. So, uh we went uh deeper into BERT, which is the typical encoder-only model. And uh I guess we also saw that what BERT has is this nice property that its encoded embeddings are very meaningful and expressive of the inputs. And so, yeah, we saw like the example of

classification, sentiment extraction. So, what we did was in particular, um taking to consideration the encoded embedding of the CLS token. So, uh I guess in real life, BERT is used to encode documents, to encode sentences, and we're going going to see

later in the class how these models are useful. And then, last but not least, we have the third category of models, which is decoder-only. So, we only keep the decoder part of the transformer. And so, here we also do a little bit of

a of a modification, so we remove the cross-attention cuz we don't need it anymore. We don't have an encoder. And these kinds of models are text-in, text-out. And so, GPT is a very good example of such models.

And actually, most models these days, they're only like they're decoder-only. So, these are the three main kinds of models that you can see out there. So far, so good for everyone? Cool. So, with that, I'm going to introduce the term LLM. So, LLM stands for large language model.

So, what is a large language model? So, first of all, a large language model is a language model. So, a language model is a model that assigns probability to sequences of tokens. So, in this case, our model always

predicts the probability of the next token. So, it's in that sense a language model. But also, a large language model is large. So, why is it large? So, we're going to see that these models, they are actually scaled up in terms of

size. So, first of all, in terms of model size. So, these days, it's not uncommon to see models on the order of hundreds of billions of parameters. But yeah, typically, when we say LLM, we say at least on the order of a billion. Um these models they've also been

trained on a huge amount of data. And here, by amount of data, we quantify that by the number of tokens that they were pre-trained with. And this is on the order of magnitude of hundreds of billions of tokens or even trillions of tokens. So, I think the biggest biggest ones are

like on the tens of trillions of tokens. So, it's like huge training sets. And they're also large because they need a lot of compute. So, typically, you need a bunch of GPUs to make them work. Although these days, there's been a lot of

optimizations to have them work on uh consumer-based GPUs. So, we're going to see that later. But an LLM is large according to these categories. So, another thing that I want to point out is that all these terminologies, they're relatively new.

So, um I remember in 2018-19 there was nothing like there was no real definition of an LLM. I think no one actually talked about LLMs. In the beginning maybe people talked about LLMs, they included BERT. But BERT is an encoder only model that does not produce text.

So with the current definition of an LLM, which right now has been pretty well established, BERT would not be an LLM because it doesn't produce text. So here we only consider language models that do text-to-text

that are very large in size in terms of amount of data they've been trained on and in terms of compute. Cool. And as we saw before, these models are decoder only. So here what we do is we remove the encoder, we only keep the masked

self-attention, the feedforward neural network, and then the you know, addition and normalization. So we only keep this. And this is the backbone of LLMs. And so I mentioned you know, GPT is a

kind of a good example, but it's not just that. You have plenty of other models. So you may have heard of Llama from Meta, Gemma from Google, Deep Seek, Mistral, Guan, so on. Like the the list is long. I would say roughly I mean more than 90%

of like modern-day LLMs, they're all decoder only. So I think that's something to keep in mind. Cool. Um Okay. So now you know how LLMs are made

of, but there is something else that people these days also introduced to these models, and we're going to see that in a bit. So I mentioned that these models are huge in size. Again, typically hundreds of billions of

parameters. So it takes a lot of compute to just compute one inference. Or also to train these models. But you may wonder, do you really need to have all these parameters be activated during a forward

pass to make a simple prediction? So I'm going to uh I have a little metaphor. So let's suppose you enter in a room and in the room there is a mathematician, a physicist, a chemist,

and a historian. So you come in this class, there's a bunch of people who are expert in what they do. And you have a question you have a math question. And so the question I have for you is who would you ask your question?

Would you ask the mathematician? Would you ask the chemist? Would you ask everyone? Well, right now we ask everyone. We ask all parameters of the model to be involved in the computation of uh you know, the generation. And so the idea here is

given an input, maybe it's not necessary to ask everyone to be involved in the computation. So the idea is let's actually just have a subset of the model be involved in the computation of the next token. So I'm just introducing this idea of

experts. So let's suppose we're introducing uh the following notation. So let's suppose we have n experts. So think of it as your mathematician, your chemist, historian, like whatever. So these are your experts. And the idea is given an input x

you're going to ask yourself who should be involved in the generation of the outputs. So you're going to have let's say another network. We're going to We're going to call it g like gates. But it's also sometimes called router. So let's suppose we have some gates

that tells us which expert should be involved in the inference. So if we have that So let's suppose here the gate tells us, "Okay, so actually expert number two is well suited to answer your question." So here the idea is that the input is just going to flow

into that expert. But not the other experts. So this has a name. It's called mixture of experts. So it's So denoted MOE. Everyone talks about MOE. So these are mixture of experts. And so the formula

that you will see a lot is this one. So the output y, which is denoted y hat, is the sum of the expert outputs weighted by some quantity, which is the output of the gates, which tells you how important

the output of each expert is. Yep. >> Great question. So, question is how do you train G? How do you train E? So, typically you train them jointly. So, we're going to see that maybe in a Yeah, a little little bit. You can think of it as, you know, just training as

usual. You do your forward pass, you compute the loss, and you backprop. And it's actually an interesting question because there is some challenges that come with training MOEs that we're going to see in a second. Yep. Uh question is what are these Es? What

is the architecture of these Es? So, let's suppose right now that they're just some network. We're not specifying them for now, but we're going to see it to this in a second. Let's suppose for now it's like some network. Cool.

Okay. So, I told you that, you know, what if we don't activate everyone? What if we activate a subset? But this formula actually um I guess uh assumes that we're actually considering all expert outputs. So, I just want to distinguish two kinds

of MOEs. So, there's one kind that is called a dense MOE. So, a dense MOE actually does not have any constraints on the number of experts that are involved. So, these weights, they can be anywhere

between zero and one. So, so think of them as a probability distribution. But it's just going to put more weight towards some experts compared to others. So, back back to the example that I had. So, let's suppose I have uh a math question. So, I'm going to ask the mathematician, the chemist,

historian. So, I'm probably going to add a higher weight to what the mathematician says compared to let's say the historian. So, this is the idea. But then, the interesting thing is when

we constrain the number of experts that are activated because here, as we mentioned previously, what we're interested in is to not involve everyone, is to make some savings in the amount of compute that we do. So, there's a second kind of MoE

that's called the sparse MoE. And what it does is it only selects the {quote} top K experts. So, K can be equal to one, so one expert, or even two. So, it's a hyperparameter that you

choose. And so here, the expression of the output becomes the sum over all the chosen experts of uh g of x times uh e of x. So far, so good? Cool. Uh and of course, there's a lot more to it. So, in case you are

interested in learning more, uh feel free to go into the resources that are at the bottom of the slide. Um so, one thing that I will say is that we have a unit of measure of the amount of compute that these models produce uh for each uh each pass. So, you will see the term flops.

So, have you Have you seen the term flops out there? No, not really. So, it stands for floating-point operations. So, it quantifies how many operations, like think of it as like additions, multiplications,

are involved in a forward pass, let's say. And it basically quantifies how compute-heavy is your task. So, typically, what we say is when we go through a sparse MoE as opposed to a dense MoE we have a lower

amount of flops. So, this is the unit of measure that you will see. But, back to your question. So, what are these experts? So, if you remember I mean 10 minutes ago, we said that LLMs

they are decoder-only models. So, I have a question for you. Let's suppose we wanted to put some MoEs in our LLM where we would we put it? So, here, I guess we have uh three choices. We have uh the mass self-attention layer.

We have the uh feedforward neural network, and then we have like this normalization. So question for you, I guess where would you put this? I guess where do you think is I guess the most complex parts of the network? Where is there a lot of

operations? Feedforwards? Yes. Yeah, great great answer. So uh it's indeed the feedforward neural network. And the reason for that is I think uh Shervin uh mentioned it, I think, in lecture one.

So, if you remember, the feedforward neural network is a network such that you have the inputs which is your, you know D-dimensional input vector and then you have uh this being projected into, let's say, uh DFF-dimensional

space, and then it goes back to the D dimensional um I guess uh space. So, the DFF is typically larger than your dimension of I guess the inputs. When I say input is here. So, it's typically larger, so

the amount of parameters that you have in that feedforward neural network is something on the order of magnitude of D model * DFF * 2 plus some bias. So, it's basically your order of magnitude. And the attention layer, if you think about

if you remember, it's basically composed of the projection matrices. What is the dimension of the projection matrices? So, it's D model * the dimension of keys, the dimension of queries, the dimension of values. And this dimension is typically much

lower. So, think of it over 100. So, your D model is typically over 100, over 1,000. And then the projection here, the DFF is over over 1,000, over 10,000. Cool. So, is everyone now convinced that this is a good way good place to put the

mixture of experts? Yeah? Cool. So, this is actually how it's done. So, in modern-day day LLMs, this idea of not involving everyone in the computation of the next token prediction

is such that you would put put the mixture of experts where the FFN is. It's basically here. And typically you would have a sparse mixture of experts, meaning that So, back to your question, so these experts are actually uh feed

forward neural network. So, you wouldn't you would have several networks that you can train. But you would only activate activate one. So, typically K would be equal to one. It can be also equal to two, but it would only be a subset, so that's my

point. Um and this routing would be done at the token level. So, if you remember, you know, the decoder, it basically takes uh something as input, so you you know,

a bunch of tokens. And here what I'm saying is that each token will be processed by an expert that may be different from the other token. So, the writer router here would take the representation of the token as input

and figure out which expert should be best for this token to flow towards. Does this idea make sense? So, I have a little um illustration later on that hopefully will help. So, now back to your question about how you train this model, like do you train

the router separately, do you train the expert separately? So, one challenge that people have is when they train these MoE-based models to make sure that all experts are I guess having a weight,

are being used. Cuz it's very possible that you train your model and that somehow only, I don't know, one or two experts always get activated. And the other one, they always are inactive. They're never involved in the computation.

So, this problem is called routing collapse. So, why is it called routing collapse? It's because the router always chooses some experts, but not others. So, this is a challenge. And the way people try to mitigate this challenge

is by changing the loss function and adding it some extra term, which is written here. So, it's basically some hyperparameter alpha times the number of experts times the sum of

quantities that depend on whether or not tokens went to a certain expert I, and then summed over all experts. So, it's not super important that you completely understand exactly how that formula works. The only thing that I think you should take away from this slide

is that this extra loss allows these quantities to converge more towards uniform distributions. So, what are these quantities just as a reminder? So, f of I is the fraction of tokens

that are routed to expert I. And p of I is the average routing probability for expert I. So, when I say that, you know, all experts should be used kind of the same what I'm saying is I want this

probability to be kind of uniform across experts. Yep. Yeah, so the question is I guess when do you compute these quantities? So yeah, like you can think of it as like you know a regular training process like you know you do some like

mini batch. You can have like go go through that through like the the model and then you compute all these quantities and then what you do is you do your your back propagation based on that. And I guess what I want you to remember is that this

incentivizes the probability I guess the the choice of the router to be more uniform across experts which is something that mitigates this routing collapse phenomena.

Yeah. Yeah, so the question is can we use dropout? Of course, you can always like bundle that with some other techniques. So people have just kind of found this to be very helpful. So speaking of other techniques, there is something that I've not talked about which is very similar

to the dropout idea. So it's called noisy gating. Noisy gating is basically uh you have your your predictions from the gates, but then you add some noise to it. So basically it's you know by pure

chance it just allows other experts to be involved in the computation. So it's also some other technique. There's a bunch of techniques, but yeah dropout is indeed quite useful for like things like overfitting and the idea can be reused in in different settings. Yep.

Yep. So, the question is how can you differ- So, you mean differentiable? So, here I guess how do you take the derivative? Is that your the question? Uh, how is the derivative So, can you explain a bit more what your concern is?

Mhm. So, I guess uh, to this question um, so the average routing probability So, that's one is a function of the gates outputs, right? That's one. PI Right? So, I guess your question is for

FI. For FI Okay, I don't have a good answer on top of my head, but I think like people have some techniques and these days, you know, you just don't even have to do this by hand. You have uh, like the built-in thing. Um, so maybe I can

follow up with you for FI, but for P of I, do you see that this one is is quite clean. It's just the average of uh, the probabilities from the gates. Uh, yeah. So, basically the probability of the output probability from the the gate, you can think of it as just the vector being projected on a

space of N, where N corresponds to your number of experts. And then it's gone through softmax, so your output is basically summing up to one. And each of these dimensions, they represent the value corresponding to what expert I

would be, I guess, used for. Like, for instance, the first dimension would be for expert one, second dimension would be for expert two, and so on. So, you just take the average of this and like this one, you can express it from, you know, all the parameters. So, I think you should be you should be fine

with that one. Yeah. So, the question is, if we increase the number of MoEs, does it increase the number of model parameters? So, it's a great question. So, it's actually actually one of the ideas behind MoE-based models, which is that you can

scale the model without having to incur the costs of having significantly more compute at inference time. So, you can increase the model's capacity. You can increase your the capacity of your model, but you will still keep some, I guess,

like, controlled amount of active parameters. And active parameters are the parameters that are that are used for a forward pass. So, yeah, people just kind of use that. So, yeah, it will just increase the number of parameters. So, that's why you see some MoE-based models that are

even bigger than the ones that we kind of had, like, on the order of hundreds of billions. We even have on the order of trillions of parameters. So, for instance, here, one reading I I recommend is Switch Transformer, which scaled up to 1.something trillion

parameters. So, yeah, it's definitely more. Uh but that being said, so if you read the paper, you will also see that these models, they're more what they call sample efficient. So, they take less time

to be as good as what the model would have been with a lower number of parameters. So, if you look at like if you uh draw the you know training training curve uh as a function of like the training time, you see that these models, they're typically more sample efficient.

Sorry? Yeah, yeah. Exactly. Yeah, everything here is a trade-off. Everything here is a trade-off. Yeah. Cool. Yeah. Um so, the question is each attention

head will have a number of experts. So, it's actually regardless of the attention heads. So, the attention heads are you can think of them as being like independent, you know, something else. And the number of experts is independent of that.

Does that make sense? Yeah. Right, right. All right. Yeah, the question is whether every block will have number of experts. It does. So, yes. And typically those weights, they're not shared. So, typically you So, actually we're

going to see an example. Um it can very well be that layer one, there is the expert number I don't know, three that was chosen, but layer two, there is like expert number one. And you know, it's it's like it's all free. It's trainable.

So, the So, the question is we will decide where to where the expert will go to. So all of that is decided by the gates, which is this quantity. Everything is decided by the gates, which has trainable weights. So you can think of this as just some

projection from the inputs X to an N-dimensional space, where N is the number of experts. So question is at what point were the inferences decided? So let's suppose we're at inference time. I'm going to walk you through how it works.

So you have your X. So you have this, you know, attention mechanism, so it interacts with tokens from the past given that this decoder only, so it's like the masked. It goes here. And at the beginning of the feedforward neural network block,

the token is of course contextual, so it has the information from like these other tokens because it's attended. And what it does is it goes here. So X first goes into G. G computes this, you know, probability distribution over all experts.

And given here that we are in a sparse MOE setting, we will only choose the top K. So let's suppose if it's top one, just the highest probability and you will you will know which experts this one will be. And so as a result of that, you will

only compute the the output value of the expert that the input was chosen. So can you elaborate on that actually? Yeah. At what point exactly? So, it's after the self-attention layer. Yeah.

Uh so, the question is uh do we have different classification for different heads? No. So, there's only one router. So, uh I think I I understand your question. So, your question is what do you do given that you have different attention computations going on in

parallel with the heads? So, if you remember, the attention layer has its these different heads, but at the end of it, what it does is it concatenates all the results from each of these heads, and then projects it once again in the D model space. Yep.

Yep. Mhm. Yep. Yes, so the question is do we have different G's? So, the only thing I can tell you is that the G is just layer specific. It's layer specific, it's trainable, so it's basically going to

learn how to process all these inputs. So, the G the only thing I can tell you for for your question is it's going to be layer specific, so the G is going to be one G for let's say the first layer, another G for the second layer, and so on. And that's when it's going to be trained.

Cool. Great. Looking at the time. Do we have any other questions here? All good. Perfect. So, now I just wanted to show you a cool thing that's I believe

the Mistral team was showing in one of their papers. So, what they were showing here was for a given piece of text to show in which expert each token was routed. So, as we noted before,

um so, experts are different from one layer to another. So, I believe here it's yeah, for layer zero, so it's like for one given layer. And we do see that you know, roughly these tokens, I guess they

leverage like a uniform amount of experts, more or less. What you would not want to see is to have every token be the same color. But luckily, it is not. But yeah, so that's one cool way of just representing how the routing is done is

to just have your input text and just represent where each token in which expert each token went. Cool. Okay. Woof. So, what we just saw was one way that modern day LLMs

change their architecture to incorporate the fact that we may want to scale the model but not increase the computation complexity for one forward pass. And we saw that with MoEs. So, you will see a lot of MoE-based LLMs out there.

And now what we will do is knowing that we have an LLM, we're going to focus on Uh don't worry. Uh we're going to focus on how a response is being generated. So, remember when I told you that, you know, these uh modern-day LLMs, what

they do is they take some text in and they have some text out. So, it's typically this task task of next token prediction. So, you have a token in, so let's say beginning of sentence, you go through your LLM, and it just uh generates the next word or the next token, so A, and then you take

A, and then it goes to teddy, and then teddy bear is, etc., etc. But, so far, we have never really dug into exactly how we chose the next token. So, what we're going to do right now is to see exactly how

we're generating the next token. So, as you know, here our LLM is just a decoder-only architecture. So, here what you have is a decoder with your input here, and then your output there. So, let's suppose for a second that we know everything that's happening

in the middle, and we're just obtaining output probabilities that are going to look a little bit like this. So, given a token or some sequence of token as inputs, you have an output probability distribution

that represents what the model thinks is the likelihood that there will be a next token, let's say that is equal to A, to airplane, to fluffy, etc. So, this is what you have. So, now my question to you is if we told you we have some sequences inputs and we want to choose the next

token, and if I told you that our model is giving out actually a probability distribution, I guess how would you choose the next token based on this? Sorry?

Great. The token with maximum probability. There's Okay, great. So yes, so first idea, let's just take the token with highest probability. So so it's a very natural approach, but I'm not sure if you've been using things

like ChatGPT or Gemini, every time you ask something, it always responds it responds something that is slightly different, right? So if you always choose the token with the highest probability, given that the computation here we're

going to see is all deterministic, what that means is you're always going to generate the same thing regardless of uh I guess with the same inputs, right? So that's the one one limitation, so it's not very like diverse. The second problem is

if you choose the highest probability token on a I guess iterative basis, you're locally optimal, but you're not necessarily globally optimal. So what does that mean? So I guess if you think about it,

our objective is for us to produce a sequence an output sequence of tokens that is I guess of a high probability. But the problem is if you always choose the highest probability token, you will not necessarily the highest probability sequence.

Are you convinced of this statement, by the way? So, let me give you an example. So, let's suppose you have the next token where one token is 0.8, the other one is 0.7. And then you choose to go with the 0.8. No,

actually it's not 0.7 because it has to sum to one. So, let's say 0.2. So, let's suppose if you go ahead with the sequence that that starts with the 0.8. Let's suppose all other token probabilities are very low. Basically, you will have an output

sequence that will have a lower probability than let's say the other path which would let's suppose have higher probability predictions in the later steps. Right? So, we're going to see this in a second, but this is the idea. So, if you

choose the highest predicted probability it's a good first idea, but it's locally optimal, but not necessarily globally optimal. And this is the reason why we have a a second method that is about

keeping track of the K most probable path. So, I'm not sure if you've heard of beam search. So, that's what beam search does. So, here K is sometimes called the beam size or the beam width. So, if you hear these terms, these are just

names that are given to the number of path that we keep track of. And so, this works as follows. So, let's suppose we start our generation with the beginning of sentence token. We want to figure out what the next token is.

So, let's suppose we have here in this example a very basic example like three tokens and let's suppose the two highest probable tokens are A and Z. So if we have K equal to two what we're going to do is to keep track of these two branches.

So that's the first iteration. The second iteration is we're going to look at all the probabilities of next token prediction for these two tokens.

And we're going to always save the two most probable path. And here for instance let's suppose if it's like the and then fluffy and then A and cute. So back to what I was saying laters earlier. So what I was saying was

here if you were choosing the path that went along the highest probability token path like the the it's very much possible that the highest probability token after the would be a much lower probability than the one after A.

And so this is what beam search tries to do. It tries to have a more globally optimal solution. So let's suppose we continue that and then at the end of the day we obtain uh I guess a number of uh potential I guess choices uh and the K potential choices and then we we pick

the one that is the kind of highest likely. The sequence with the highest probability. So people typically what they do is they take the sum of the logarithm of the probabilities of the tokens. So they they what they

say is they say uh okay so the log probability of the sequence is the sum of the log probability of each next token prediction. So, it's the log probability of A uh knowing BOS and and then cute knowing BOS and A and so on and so forth.

But, I just want to point out one limitation of this approach, which is that the more you generate tokens, the lower your I guess uh ends sequence probability will be.

Cuz if you think about it, you know, all these probabilities are between 0 and 1. So, think of it like in the kind of multiplied sense. So, let's suppose you have the probability of the whole sequence, which is just a multiplication of the probability of the next token.

The more you add probabilities be- below like less than one, the more this quantity will, I guess, go towards zero. So, I guess this method as is will prioritize sequences that are shorter.

And so, for that reason, beam search has some uh additional term that basically counteracts that that effect. So, something on the order of like one over number of tokens to the power of something. So, in practice, there's some uh technique to make sure that you know,

things kind of work relatively well. But, okay, let's suppose we figure out all these things. Uh the problem is that we need to keep track of this most probable path. We need to do all this uh kind of

saving, etc. And it just like requires a lot of computation. And the other thing is we're still interested in the most probable path which basically will lead to a sequence that is, you know, very that the model thinks is very likely.

But sometimes what you want is for your output to be more diverse or more creative. So that's why beam search is actually not something that people typically use. People use beam search for things like machine translation where you actually

need to have something that is close to something being very likely. But actually people use a third method. And this method is called also the sampling method. So I told you we have a probability distribution over tokens regarding what the next token should be.

And so what people do is they just sample the next token using that probability distribution. Does this make sense? So in this example fluffy, gentle, kind, and let's say smart will have a higher probability of

being drawn as opposed to let's say airplane and where that have a lower probability of occurring. Non-zero probability, but they have a probability of occurring. Cool. Any questions so far? Yep.

Right. So the question is it's not for training, it's for inference. Yes, correct. So this is the You can think of it as response generation. So let's suppose you have your model that is trained. What you want is to generate an output. So what would you do? Yeah.

So I guess just to complete my answer, so during training what you would do is care about the upper probabilities and then compare them with the actual label which is most of the time like a hard label. And yeah, this is what you would compare. So this one is let's suppose

you have an LLM that is trained, how would you generate a response? Cool. All around goods? Yeah. Yeah. Yeah, so question is how do you do sampling in this situation? So it's

actually my next slides. But I just want to make sure everyone was uh uh on the same page regarding just the intuition. So highest probability is called greedy decoding is probably not something that we want.

Beam search is a little bit better. It's more something that is globally optimal. It's not globally optimal but more towards that. So it's better but it lacks diversity, it lacks creativity which is why what we want to do is to actually sample each token.

Um and I guess we have a few methods that's um also restrict the kinds of tokens that we want to sample from because I mentioned you know these very low probability tokens they can still

again, theoretically be uh sampled but it's not necessarily something that we want. So what people do is they typically restrict the highest probability tokens and only sample from them. So you may have heard of this term top K

sampling. Who has heard of this term? Yeah, a little bit. Okay, so what you do is you select the top highest probable K so the top K highest probable tokens and you sample from them.

So, let's suppose if K is equal to 4, you take the highest four highest probable and then you just sample with them. And there's something else that is quite similar in idea, which is called top P. So, top P is that you limit yourself to the top to

the highest probable tokens such that their cumulative probability is more than a threshold P. So, again, it will do the same thing. It will select the highest probable um tokens.

But then, there is a part that I still left out, which is how do you obtain these probabilities to start with? So, if you remember, here I had mentioned that we just assume we have the probabilities. We just have them and we want to choose

what the next token is. But now, the question that I'm asking is now that we know what we will do with these probabilities, I guess one question is how do you obtain these probabilities to start with? So, if you remember,

these transformer-based architecture basically computes an encoder representation of the input. And what you have is some final layers at the very top of the figure, which aims at projecting

the vector into the space of the vocabulary. Cuz what you want to do is to have a probability number for how probable it is for you to sample a given token. Right? So, here what you would do is

at the very top of the of the architecture have your input, which is your encoded embedding of the token, go through a linear layer, which basically projects your D model vector into space of dimension size of V. And of course, what you want is

probability, so you would have a softmax layer, which basically converts everything to probability such that everything sums to one. And in order to compute the probabilities, this is the formula that you would use,

which is the softmax layer. So, there is a a hyperparameter that is quite important that I want to talk to you about, which is the temperature T. And so, this is where it pops up. So, you have the probability of

the next token being a given word, which is equal to the exponential of the input respect to the given word over temperature, and then you normalize that by the sum of all the other exponential of the quantity over T. And now what we're going to see is

what that T is used for or what that T actually does in practice. So, before we go into that, just one question. Has anyone heard about temperatures when it comes to response generation? Yeah?

Cool. So, hopefully that will kind of give you a better idea of how the temperature kind of influences your output predictions. So, I guess the question that I want to ask you is what would be the impact

of having a low temperature versus a high temperature? So, low temperature would correspond to diverse what? Yeah. Yeah. Mhm. How do you know what? So, we'll we'll

come to that in a second. So, yeah, do you have a a lower temperature? Increasing temperature. So, I guess back to your the explanation about like I guess lowering the temperature and what impact it will do to the So, I

guess like do you have a suggested a response to that? I guess like You lower temperature. Let's suppose you have a lower temperature, what happens? Mhm. Yeah. Yeah. Yeah. Yeah. So, I guess um So, the long story short is low

temperature will create a spiky distribution and then high temperature will create a uniform distribution. But, I guess So, I think you had the right like intuition. Um I'm going to maybe write this in more mathematical terms.

So, oops, okay. Um let's suppose you have uh don't your probability, which is uh you know, the exponential of xi over t over the sum of exponential of xj over t.

So, just mathematically, you can actually prove uh what is happening here. So, let's suppose you have the index of the highest xi. So, let's call that k. So, let's suppose what I do is I will

factor by this uh quantity. So, actually here I don't have space, so let's do here. So, it will be a e of k temperature, and then here you have the sum of over all j of exponential of xj

over t minus xk over t. So, what I did is I just multiplied the numerator and the denominator by exponential of xk over t. So, I multiplied numerator and denominator, and of course they cancel out.

But then what I have here is xy minus xk over t, and here xj minus xk over t. So, when i is equal to k, this term is zero, right? It's exactly zero, regardless of the the And here

XJ - AXK is always negative or zero. Right? So here if I is equal to K you have zero over T. So here it's one.

And then you have one plus I guess some quantity. So J minus XK over T, which is going to be negative. So the T going to zero so that one will be I guess uh going to let's say minus infinity.

So exponential of minus infinity is zero. So what you will end up with is something where for I equal to K you will have a non-zero probability. But then for

I not equal to K you will have zero over something that is not equal to zero. Which is zero. So just mathematically, if you factor by exponential of XK over T

where K is the index of the highest value I guess the highest logit or the highest activation vector can actually show that for a small temperature only the highest so the index of the

I guess highest value will be the one that will be I guess highest probable with a spike there. And then when you have a high temperature, basically it will look like a uniform distribution because

all these all these quantities so when T tends to plus infinity, this tends to zero. So exponential of zero is just e. Oh, sorry, not e. One. It's one. So it's one over the number of J. So it's one so just a

uniform distribution across all the tokens of your vocabulary. Yeah. Um so the question is how can I interpret a small Mhm. Mhm. So the question is can I interpret that as a Gaussian? I think so it's kind

of tough because Gaussian you have like some continuous quantity as in the x-axis. So here you have you know, you have tokens so it's kind of discrete and it's not like something that you can order. So I'll just probably interpret that as small temperature is very spiky.

So you you will you will really have a given set of tokens that are the highest probable that will appear more. And if you have a high temperature, then basically tokens even the ones that were not there to be kind of the highest probable

will actually have an adjusted probability that that will be higher. Yes, so you can think of it as like some kind of scaling in that sense. So long story short, what I want to tell you is if you have a small temperature, it will encourage the next token to be

geared towards being the highest probable token. And then if you if you have a high temperature, I guess the distribution of probabilities will be kind of closer to a uniform if you really increase that temperature by a lot.

So, your output will be more creative. You'll have tokens that um you would have not drawn that would be drawn. And so, what that means in practice, if you I don't know, if you're with your favorite LLM, and let's suppose you want to uh I don't

know, write something very creative. So, which one would you use? Would you use a low temperature or high temperature? High temperature? Yes. So, if you want something that's more deterministic, more I guess closer to uh something that is very um I guess

what you think would be a high quality, we'll use more of a lower uh temperature. So, one note here is that if you have a strictly positive temperature, every time you run your model over an input, you will obtain a different output.

Right? So, something I want to point out is nothing in the transformer architecture is probabilistic. Everything is deterministic. The only thing that is not deterministic is how you sample the next token. It's the only thing that

is not deterministic. So, what will you do to have like a deterministic output? We'll have T equal to zero. T equal to zero, you know for sure that your output will be just one thing and nothing else. Well,

that's what is kind of the theoretical property, but in practice, you have some stuff that is happening in the computation that introduces some non-deterministic

operations. So, it's very much more advanced than the scope of this class. Much more advanced of the scope of this class. I just want to call out that in practice, T equal to zero may lead to different results because of this kind of practical piece. So, what I recommend, so there's a

suggested reading, just you're completely optional. So, there is a very recent article around defeating non-determinism in LM inference. So, I recommend that you read it in case you're interested. So, the high-level idea is

our GPUs are hardware, when they reduce some of these operations, sometimes they are reducing numbers that are on really different scales. So, the order at which these operations are happening is actually quite important.

So, the idea is if these operations they happen in different order, it's may lead to different results. Even if in theory it should be exactly the same, in practice it may not be the same. And this article actually does a great job at just explaining the intuition.

So, yeah, just if you're interested, completely optional. Cool. I know I'm kind of late, so I guess last thing that I want to say is let's suppose what you want to do is to generate an output in a very specific format, let's suppose a JSON, JSON

format. So, I guess a very naive approach would be to tell your LLM, well, uh please generate this in let's say JSON. And then it produces something, and then you kind of uh try to see if it's a valid JSON. If it's not, you repeat, you just tell it

to generate again until it uh does something well. So, that's the first naive approach. Well, there is a second approach that is called guided decoding. And what that does is during the generation process it filters out

what it calls invalid next tokens. So, here uh let's suppose I want to generate this JSON. I know for sure that my first token must be uh something that opens the, you know, the I forgot what the English word was for this, but, you know, it's just opens the

the brackets, yeah. Open the brackets. So, you can only have this. And then you can only have the property name, it's and so on and so forth. And sometimes you can have more than one permitted next token, in which case you would go back

to our, you know, next token strategy. Yeah. So, the question is how do you restrict uh the the other tokens? So, there's a bunch of papers that go into that. We will not cover this, but I can give you some pointers. Uh just type finite state machine FSM,

uh context grammar. So, there's a bunch of papers that do that. We will not cover that here. Cool. And I think with that we will uh go to the second part uh with Sherwin. >> Great. Thank you, Aashish.

So, uh now together we're going to look at different prompting strategies. So, now that we know how responses are generated, we're going to see how to get responses and how to get great responses. So, let's go back to our favorite example about our cute teddy bear.

So, just I want to introduce one piece of vocabulary. So, when you have some kind of input, you have the length of your input measured in number of tokens. And you will see in the literature that it can have different names. So, you can see it called context length,

context size, window size. And I think the latest tools, like if you code on, you know, cursor or any other code assistant tool, I think they call it more context length. But like all these terms are equivalent. And they know the same thing.

Okay. So, now I want to take some time to discuss like what can be some orders of magnitude here. So, like modern day LLMs, they tend to be in the order of magnitude of tens of thousands, hundreds of thousands, or

millions of input tokens as inputs. So, this is the kind of input it can take. So, sometimes you hear some new LLM boost some number. And then that number of context length is exactly that. So, it's like how much tokens can it accommodate in a single pass? Okay, great. And then yeah, the models,

so you have seen like maybe some like advertisement of these models. So, I think like Gemini and others, they're in the million territory. Um and you know, does that mean it's all nice and pretty? You know, do we if we have like more context length, is it

going to solve everything? Actually not. There is a phenomenon that was recently dubbed as context rots in a paper from earlier this summer where basically the authors are experimenting the capacity of the model to retrieve some piece of

information uh in a test called needle in a haystack. So, basically they ask some question and in larger and larger pieces of text, they bury the answer. And they they try to look at the capacity of the model to surface that answer.

And then you can see that with respect to an increasing context length, that ability to ground the information with the answer that is in the context decreases. And uh yeah, the paper I think is a very interesting one. It uh like controls with respect to what else is in the

context. Like there is a term of like distractors where they like put some noise and then they see distractors basically contributes in uh decreasing the retrieval capability. So, you know, also what is in your context matters. Um so, this is why in general when you

have a retrieval problem where you want to use your LLM to solve it, you have some good incentive to try to target as much as possible the right piece of context for your LLM to see and predict on. Okay, great. And yep.

>> Yes. So, the con- Yes, so the question is uh is the context length exactly what is shown during self-attention? Uh yes. Yeah. So, and then we're going to see So, I think we saw last time that uh sometimes there are like some uh

tricks that are used for the like complexity of the self-attention mechanism not to be n squared. So, this is what is being used to uh like manage basically the complexity of the computations as the context length grows. Yeah, but it was a great callout that that's exactly uh what it is about.

Okay, great. Any questions? Any other questions? Okay, great. Um so, now let's define what do uh prompts usually look like. So, there is no formal theory on how to structure a given prompt, but this is these are the main lines that are

usually found in uh the prompts presented to models. So, you can distinguish a part that is uh like setting up the context where you like just put the setting, you know, you you make it clear to the model what's, you know, kind of query you want to to issue. Then, uh

let's say if you have some task that you want the model to perform, have instructions. And then these instructions are like some sort of function that take as input something. So, you add some inputs. And uh in order to get what you want out of the model's response, you may want to

add some constraints uh out of it. So, here we we took our favorite example with a teddy bear. Uh the context is, you know, like what is the teddy bear basically like what is the mood of the teddy bear? What do we want uh you know, to do in order to um like

make our teddy bear happy, and then uh we we give some inputs regarding where the story that we want to generate is, and then uh we give some constraints. If you want some other example uh in the LLMs that you query every day So, the context could be um you know some sentence that says, "You are

ChatGPT. It is uh you know, we are October 10th. Uh it is uh 4:44 p.m." So, you set the setup. The instructions can be uh basically what the user queries alongside the inputs. And then constraints might be things

that you don't see as a user, but that might be um you know, present in the prompts given to the LLM such as safety instructions. For example, do not generate any contents that might lead to harm or things like this. So, you know, every time you see an input being fed to an LLM uh I think

these projection into four these four dimensions can be a good mental model of seeing, you know, which pieces correspond to what goal um in in that structure. Does that make sense? Okay, great. So, now that we know uh like what kind of mindsets we might have

for inputs to an LLM, let's see how we can get an LLM to do what we want. And let's see how we can get an LLM to do what we want without tuning any weights. And we can do so with a concept called in-context learning where the learning is a bit

of a term that is overloaded because you don't actually learn anything with respect to the weights of the LLM. But you can uh like distill some knowledge inside of it um you know, as part of the context in order to do what you want.

So, you distinguish two main categories of in-context learning. So, there is one category that is very simple, you know, in mindset, it's called zero-shot. It's basically you don't give anything other than your inputs, um, your input query, you know, you you just

ask the LLM to do what what you want to do. And then there is another, uh, school of thought called a few-shot learning where you give examples of inputs and outputs to the LLM before asking the input that you're interested in. So, in the case of a teddy bears and a

bedtime stories, so you might, you know, name your teddy bear. So, maybe you have a teddy teddy bear that's called teddy and you generated a story. So, you put your query, you put the story that you want to generate and you give multiple such examples. And let's say you have another teddy

bear that's called, you know, Bob, you know, and then you want to generate a story for Bob. So, you put all of these examples and you ask the LLM to generate, uh, the story that you're interested in and then this is basically what we call the few-shots

setting. Okay, great. So, now, um, generally, when you look at the performance of the of the given, um, like of the resulting task, giving examples tends to steer the LLM nicely into the task that you're interested in just because

you have like given an idea to the model of what you are looking for. And then it can use what it has learned during its training process to connect the dots and, uh, basically replicates, um, and then, uh, Uh, but of course you need to gather

such examples, so this is costly. Uh, this will put some more, uh, tokens in the context window, so you will need to like more computes. Uh, but uh, there is an interesting trade-off here that we see in recent models. So, they're gaining more and more reasoning

capabilities, which is why I put the generally, um, nuance in italic here. So, they're generally better few-shots, but not always. Because these days, uh, with these like better models, people have seen that with, uh, like

basically making the instruction better, you could make the performance of in-context learning on par or even better than if you provide examples. Cuz basically, when you think of it, when you provide examples, you constrain your model into given sets of examples that are finite. So, when you are at

inference time, let's say you want to perform a task on a distribution of data that has not been seen, it is harder for the model to generalize because it will try to align on what it has seen in the context, whereas if you turn your instructions into something that is more

reasoning-based, you explain how to do the task with natural language, it can use its reasoning abilities to actually do it. And then, this is something that you see more and more these days. So, the literature on this, I think, is still in in progress, but you have some papers like your plan and solve,

uh, that's, I think, came out recently and that showed, you know, if you ask the LLM to plan itself and then solve something, uh, it can have very good performance. So, yeah, this is an interesting um, this is an interesting fact. Okay, great.

So now that we have seen uh basically the kinds of learning that we have, now we're going to see what we can do to improve the quality of the response. So there is this concept called chain of thoughts where uh researchers have seen

that if you force the model to come up with some rational to some answer before actually giving it it would give higher performance. So this is what you what people call as chain of thought. It's basically what has led you to the answer. So here for example if you uh you know,

ask yourself, you know, how old is this teddy bear? And if you force the model to respond directly with a number it might not be able to do the connection as to exactly why the teddy bear is a given age. Whereas when you give the kind of full

chain of reasoning, then it becomes clearer as to, you know, what led to that response. So I think this is the main mindset behind this technique. And uh basically this is something that is that can be used in in-context learning. So if you give uh like few-shot examples, you know how old was

the was this teddy bear? You give some number and then you slightly change the query and then based on the reasoning formatting and then the response, the LLM can adjust the reasoning and the response accordingly. And it will force the model to output some reasoning alongside the response, which shows

an improvement in um in basically uh metrics. Okay, great. And then yeah, something else that I want to say you know, let's say you are uh you want to do a task and you want to do it well. You know, oftentimes you will always have some samples that do not work.

And then for them you want to have debugging ability, right? And uh usually when you debug with LLMs, you don't debug like the old days. You don't look at weights at at the intrinsics of the LLM. What you want is something more interpretable that comes out of it

in terms of tokens. And usually uh you know, with these techniques, you can see the reasoning that the model had before outputting a given response. And you can debug basically what went wrong. So, if you ask "How old will will the bear be next

year?" and if in the chain of thoughts it says uh "Hey, we're in 2019." You know that somehow in your context, you know, oh, maybe I put the wrong dates, you know, in there. So, you can like trace back to You can do some root causing very easily.

So, it's also used for that. And uh you know, exactly in the same way as other techniques that increase the number of tokens, this is a trade-off that you have to manage that it will of course take more time uh you know, to infer because you need to to generate more tokens.

But typically we're fine with it. Any questions on COT? Okay, great. So, now let's take it one step further. Um so, I want to introduce, you know, even to make COT even stronger, you can sample your model

several times, look at the answers it generates, and then do some majority voting to select the answer that was predicted most of the times by a given LLM, and this is what we call self-consistency, where basically you sample responses multiple times, and then parse

the actual answer. So, basically you kind of factor out the whole reasoning and then try to target the answer and then by majority voting you can come up to an answer in a more um robust way. Yep. Yep. So, the question is do you need to

have some benchmarks to know if it's better? And yes, absolutely. I think the paper operates on top of all the arithmetic and then mathematical based ones. And then I think one tangential question to yours is how can you locate the answer and then do major majority voting on it? So, typically you can put

into the context some instruction that says put the actual answer last. So, you can just like extract the last. People I think uh use regex based techniques otherwise to extract the answer or you could even think of using some other LLM to extract the answer. So, there is always a way to kind of do

it. Uh but uh yeah, to your point, yes, we need uh some benchmark and then ground truth labels to assert that this is indeed better. Yep. So, the request here So, the question is uh is it going to be sent to the same request as example? So, typically you sample it in parallel. So,

basically you ask your model exactly what I've seen just mentioned. You sample from the probability distribution of BOS and whatever tokens you had the next token and you do that in a several other uh kind of branches. And you do that all of that in parallel. And then you kind of parse the answer at

the end of it. So basically the latency of this process is equal roughly to the maximum latency of either parallel generation because you can do all of this in parallel. Yeah. So no So none of these go into the context of each other. They're all done in parallel and then you get final

answer. Great. All good? Okay, great. So now that we have seen a few prompting techniques, I want to cover together tricks that people have come up with at inference time to make the generation as

efficient as possible. So Um and basically yeah, so in modern-day models you have a lot of parameters. You want to generate a lot of tokens. How do you do it the most efficient efficiently possible? So I want to ask to divide this thought process into two parts. So we're going to see, you know,

what methods we can come up with that give up that give us increased efficiency on an exact level. So you exactly do the same computations as you were supposed to do, but you know, in a more efficient way and I put some um you know, hints as to what kind of techniques we're going to explore. So

you know, let's stay Let's try to look for techniques that avoid redundancies. Let's try to see what we could do to manage the memory in the best way. Uh reformulate the equations inside the LLM in a way that could simplify the the generation in practice.

Then there is a second category that we're going to explore as well that is going to focus on what kind of approximations it might be fine to do and get a high quality answer at a at at a lesser cost. But, you know, it will be approximate.

So, we have, you know, what kind of um variations we could do on the architecture? Is there something we could do on the embeddings um to make them more efficient? And then maybe on the token prediction side, is there something we could uh do to make it you know

faster? Does that sound good? So, we have approximately 22 minutes. We're going to try to go through all of them um here. Okay, so I grouped the categories of techniques

into exact and approximate techniques. Uh but actually, we're going to look at them in a grouped manner. First looking at the attention layer, uh seeing what kind of techniques we could um have there. And then in the second time in the second part, we're going to look at the output layer

and then see, you know, what we can do at the level of token generation to make things uh you know, as as good as possible. Okay, so let's start at the attention level. So, we have seen

that uh you know, for every token, you need the current token to attend to the previous ones, right? In this masked self-attention. So, let's say you generate your sequence. You are at given token, so let's say, you know, you have generated a cute teddy bear and then now you are

at is. Now you have the query is. You will compute the key representation and the and the value representation of is because, of course, you have to do it. It's your current token. But we want

to have a way to reuse the past computations we had done to compute the key representation of the previous tokens and the value representation of the previous tokens. Does that make sense as a goal? Does everyone agree? Okay.

And more precisely, basically we want to find a way for the key and value matrices to be saved. And you know, I'm not underlining the the Q parts here because of course the query corresponding to the previous tokens are not going to be of interest for the

the present token. So it's like the key and value part. Okay. So there is like this concept of KV cache where the goal is to store this key and value matrices somewhere. Um

and reuse them directly from the cache. So like what I just mentioned here, you know, when you want to compute a given token, you would reuse the key and the value directly from the cache instead of computing it again. So yeah, so Um yeah, so this is basically

you know, representation of what we just mentioned here. Um yeah, does that make sense? Okay, awesome. So what else we could could we do? Oh yeah. Yeah, great question. So during training, do we do KV caching? I would

say during training, you have this concept of teacher forcing where you put all your inputs and pass it all together at once. So, this concept of key vacation caching doesn't even come up. Uh yeah. Yeah, but great one. Yeah. Yeah. Yeah.

Yeah. So, the question was you know, what is the point of all this? We want to just reuse like the computations that were already done and then your answer is yes, spot on. Any other questions? Okay, great. So, now that we have seen you know, that we could cache these

quantities. So, what else could we do? So, is there something from last week's lecture that we could reuse? You know, maybe something that reduces the amount of cache you know, the key and value. Do we have some techniques?

Sparse attention. Um Yeah, that could be. That could be. But not here. Like let's say you are not you are tending to everyone and you focus on the number of keys and values. Is there a way to reduce this number? So, just to recap, we have

here I'm operating in the context of multi-headed attention, which is you have your H heads. So, you have H number of query projections, H key projections, H value projections. Is there Is there any technique from last week that we could reuse that

could reduce this number? Yeah, I heard it. Yeah, group query attention, yeah, exactly. So, we had this, um, you know, concept of grouping keys and values together, uh, where basically the general

formulation is called group query attention, where you group these, and then the external values H and 1 denote respectively the full multi-headed attention, and then multi-query attention. And then in, uh, modern-day LLMs, uh, like a lot of papers they use

uh, GQA, uh, with with some, uh, group that is, uh, sensible value. Yeah. So, this is also something we can do. Okay, great. And now I'm going to go a little bit into the hardware side of things. So, if we were to store the cache for

all these values in a naive way, you know, at inference time, so let's say you receive So, let's say I'm an inference server, I receive queries from multiple users, and let's say I receive a query one, and I receive a query two,

um, you know, a naive way of storing the key and and value, um, you know, matrices would be in reserving a pro- a portion of the memory at the beginning that correspond to the entire context length, because you don't know, you know, where you're going to stop, right? You're

decoding, because you stop your decoding when you hit the EOS token. So, you would have like this whole block of size, uh, you know, context length, like maximum context length, that could be reserved. So, one observation is that it leads to a lot of waste.

So, let's say if your context length is of size like 2K, you have, uh, 2K reserved for a given, uh, you know, request, 2K there. So, at any given time, like let's say you want to get more requests, you want to serve more requests, your memory will very quickly not have enough space to uh accommodate

uh them. Does this constraints or does this challenge make sense? Yeah. Okay, and then there is this paper that's that is called page detention and it defines several like

quantities. So, there is this like reserved quantity, internal fragmentation, and external fragmentation. Internal fragmentation is basically the space that is being reserved by the model to complete the request. And the reserved spot is the subset of

it that corresponds to tokens that were actually being used. So, it's the kind of space that's actually used in the internal fragmentation. There is nothing in there, but this was reserved. And external fragmentation, it's the memory management system that doesn't

necessarily put one you know, block one after another, but has its own way of allocating memory blocks. So, it might leave some other gaps. And they came up with a system that is called a page detention that is you know, powering one inference

package called the vllm that solves this issue by mapping like the generation process by blocks of fixed size. So, instead of uh allocating a whole portion of the memory to answer a given request, it breaks it down by smaller chunks.

So, I think the paper takes like a value of 16 for blocks. So, as you can see, let's say you are in your generation process and you have used a given row, you just start using another row without um you know, wasting more space than that. And then you have some dictionary that

maps token position indices to uh to basically their their cash values. So, there is like a smart way of managing it. And they show that it reduces fragmentation by quite a lot. Yeah.

Okay, great. Now, let's do something else with this KV cache. So, uh we just saw that, you know, you have your internal representation of your token and you project it into query, key, and value. And then key and value

is actually something that is of a dimension that is like non-negligible and you need to store uh eight copies of it in each transformer block. So, you have many of these uh vectors that you need to keep track of. And is there a way to make that representation somehow more compact?

And this is a topic that uh DeepSeek has um you know, tried to tackle in a concept called um I think it was called multi-latent attention. We're going to see uh so, you know, let's look at the

vanilla case. You know, if you are in multi-headed attention, then for a given representation of a token, you have eight projection matrices that turn it into a key. Does everyone agree with that? So, it's the kind of

uh self-attention formula, you know, you have a projection matrix W K for keys that will project the token representation into some key, and you have H heads. You have H such projections, and you have H such resulting embeddings that you need to

store in your cache. Cuz you have that for keys, you have that so for values. That's a lot of, um, vectors to store. And these keys and values, they are, uh, you know, quite long as well. Uh, so let's see if

we can like, um, make it smaller. What it's multi-latent attention does is that it factorizes these, um, you know, projection matrix into an intermediary space that is of lower dimension than the space of keys. You have a first transformation that

reduces the dimension, and then another one that decompresses it. So this is the first, uh, operation kind of that they did in order to make the representation more compact. But they did something else that is very

smart. They said that the compression matrix could be shared across keys and values. Which says for a given token representation, the cache that you need to store for

keys and for values is the same. And then you would have, um, you know, still different matrices here for the decompression part to like actually learn different representations for a key and value, but you know, one um, simplification here has to like

share it for like across keys and values. And even better, share it across the H heads. So, instead of having H search embeddings, you have just one. Uh, and then you do that, you know, for key, you do that for value. So, at the

end of it, for every Transformer block, you have a single representation per token. Does that make sense? So, not only you have, like, you know, less things to store, the Deep Seek V2 paper also showed a performance improvement that

it's uh, kind of credited like some regularization um, consequence of doing so. So, it it learns representations that are maybe more useful and shared across keys and values. So, you know, apparently there is also um,

performance benefits to it that is not just hardware-based. Okay, great. So, now we have seen some trick Oh, yeah. Yeah, so the question is, do you tune the low-rank dimension? So, the dimension itself is a design choice.

It's fixed. So, the question is, is it the same uh, like, lower dimension for everyone? So, the dimension size is fixed and is the same for everyone, I think. So, but it's a design choice. Yeah, you you could have different ones. But, I think in practice it's it might

be the same one. Yep. Any other questions? Okay, great. So, now we have less than 10 minutes. We are going to cover techniques that operate at the output token level. Um, and then start with a concept called

speculative decoding that is kind of a very interesting method that uses some smaller model to help the generation of a bigger model and then uses some scheme that makes the distribution outputs match the one of the target one. So it uses a combination of tricks of

using like a smaller model to generate things and then gates it with some mathematical based properties to ensure we get a distribution that looks like the one of the big model. So here's what is the mind like here's the mindset of it.

So let's just come back to our favorite example about teddy bears. So what you do is that you ask a a smaller model uh that we that the paper calls draft to generate next words. So you have like my teddy bear, you know, what could be next words? So you have one pass, you

know, you find token is, you feed token is here again, you find cute and smart. Since the LLM is small, this is typically done faster than with the big LLM. And then once you have all of these, you put the tokens that are predicted by the smaller LLM

all as inputs to the target uh LLM that is like the bigger model, like the one that you use to generate probability distributions for each of them. And then we're going to see that by having some rule

on the output distribution of each of these tokens you can simulate uh distribution a probability distribution of each token of each next token that's um kind of looks like the one of the target models.

So here's basically how it goes. So it looks at the probability of the the token that the draft model has predicted. So if the probability of the draft model is bigger than the one of the draft model in the draft models output distribution, then you just

accept the token. Otherwise, you have some acceptance rejection mechanism that either accepts the token or rejects it. And you know, let's say everything is accepted. Then in a single pass, you were able to advance, you know, by way

more tokens. And then if it fails, then basically you resume the process of generation from that token onwards with some adjustments on the distribution. So one question that you might ask from all of this, you know,

this looks like a recipe. Why is that matching the target distribution? So if you start from the law of total probability and write each term with these quantities, then you will find the target distribution at the end. So it's an exercise that I encourage you to do. And

the paper that is attached to the slide here demonstrates it in like a just a few lines. So it's a very simple proof. And I think it's a very very interesting one. Does that Does that make sense? Yep. Yep. So I think it's a yep. The question

is is that rejection something? Yep. So some of you might be familiar with it's already. Does that make sense? Yeah, and then one thing that I didn't say is that why did we even put the last token here? You know, we put all the

draft tokens but also the last one that was predicted because by doing a single forward pass with all these draft tokens, you get for free the probability distribution of the token that comes after that that you can then just sample from Q K + 1.

So, like just to give some summary of the rational um doing a single pass is like as expensive as doing one pass at a time because at inference time you are memory bound. Like in other words, uh computations are not the limiting

factor. It's basically the memory that will bottleneck your computation. So, you want to do it on a smaller model and then on the big models, you want to compute all of these probability distributions at once. Does that make sense? Okay, great.

And then I want to talk about one last technique that is called multi-token prediction. It's the same uh though so by the way, this previous technique was called speculative decoding. And then this one is basically doing the same

but so it's doing exactly a different thing but the draft model is embedded in the same model, which is a very powerful. So, basically it's a model that uh attaches multiple heads on top of the representation of the last decoder.

And the process here is that at training time it doesn't do next word prediction. It does multi word prediction. And at test time the draft model is all your heads and your main model is just the first head. So, you have like all your drafts tokens that you then feeds back to the

first head and then do accept acceptance and rejection. So, the paper does it in a greedy way. So, it doesn't do it with this like formula because since the architecture and then the objective function has changed, you don't have this like nice property of finding again the like next token predictions

distribution. But, you have like a slight variation of it. And yeah, so like the interesting notes out of the multi token prediction is the change in objective function and then seconds the the fact that the draft model and the

target model are basically embedded in the same one. So, don't have to like separate the two. And yeah, so you do remember the slides. We have explored techniques that can remedy each of these aspects. So, yeah, I highly recommend, you know, taking a

look at the associated papers as well. And with that, thank you very much.
