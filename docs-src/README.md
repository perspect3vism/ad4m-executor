# Introduction

The name AD4M is an acronym for
*The **A**gent-Centric **D**istributed **A**pplication **M**eta-ontology* 
or just: 
**A**gent-Centric **DA**pp **M**eta-ontology.

AD4M is a meta-ontology and a spanning layer - an upper extension to the TCP/IP stack.
But AD4M is also a framework for building apps - mainly social apps,
which renders it an engine (like a game engine) for social networks and collaboration apps.
With its ability to bootstrap specific ontologies from its meta-ontology,
it is a malleable social network itself.
It could be the last one.

At its core, AD4M is just an idea, 
a formalization of a different approach, 
a complete set of basic concepts that together span a new paradigm of (distributed) software architecture.

It tries to capture the quintessence of what *really* goes on in human communication networks,
in order to shape the digital space around that reality - instead of having the technology dictate how we communicate.

Putting the human first and starting from a pure agent-centric approach,
AD4M deconstructs the concept of applications and suggests a different principle 
for the creation and maintenance of coherence in communication networks:
social contexts (who am I talking to?) and shared subjective meaning, 
instead of assumed objectivity implied by monolithic apps that don't differentiate
between agents' different renderings and associations of the same data or event or subject.

## Meta-Ontology

What *really goes on* is that agents/humans exchange expressions of various (and evolving) languages
in order to share their partial perspectives/associations with each other and thus convey meaning, 
build meaning, make sense of things together.

![AD4M ontology](ad4m-ontology.png)

In order to suggest a minimal assumption for maximum buy-in,
AD4M carves out this quintessence of what human networks and the internet have in common,
by postulating an ontology of three basic and irreducible concepts:
* **Agents**
* **Languages**, and
* **Perspectives**.

**Languages** include **Expressions** in their definition, and **Perspectives** include **Links** (Link Expressions, to be precise).

Through combination of these basic principles, two important derived concepts
are constructed:
* **Neighbourhoods** (i.e. shared Perspectives)
* **Social Organisms** (i.e. fractal, super agents, defined through shared perspectives and shared interaction patterns/social DNA).

All these are discussed in detail in the [Concepts section](concepts.md).

## Spanning Layer

Similar to how the IP layer decouples application protocols from physical links
and allows many-to-many combinations between them by capturing the quintessence
of computer networks through the assignment of a unique address to each and
every node,
AD4M integrates DID to assume a unique and independent/sovereign address per human/agent
and decouple application specific semantics from data storage and integrity layers.

![spanning layer](ad4m-spanning-layer.png)

AD4M is an interoperability layer that sits between an app's UI and the
(centralized or decentralized) back-end components or p2p networks.
Using AD4M, an app can be built without being coupled to a specific storage
technology.
Both app developers and users are able to switch Languages and with them storage
layers while keeping the other components of their running app.

The sections [Getting started](start.md) and [Writing and using Social DNA](sdna.md)
cover the uper parts of the stack,
[Creating AD4M Languages](languages.md) shows how to wrap existing storage layers
and create new ones as Languages.

## Why?

The goal is to arrive at scalable and interoperable communication infrastructure 
that enables **group agency**, i.e. **super agents** (here called Social Organisms)
**without imposing a bias on how a group manages itself** 
(and how it defines its coherence) to have agency 
and which technological details or semantic slaings they have chosen.

*This is the real problem we're facing when trying to provide a
technological solution to the web's fractured sense-making.*

AD4M is a sense-making network disguised as app development framework.
AD4M apps don't have to leak any of the AD4M concepts at all,
and they would still be interoperable with each other to the degree
of just being different views/portals into the same agent-centric semantic web.

AD4M brings Game B qualities to web3.

It's **web B**.
