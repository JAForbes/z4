# Zed vs Streams

In many respects, Zed is designed to replace all conceivable stream usage in a client side application.

Streams are incredible, I've been a big advocate for a long time, especially in the mithril.js community.

But, they have flaws.  A quick rundown:

- Stream state is decentralized which can make it hard to optimize memory usage and value propagation
- A given stream has no awareness of another streams propagation;
    - and so it is quite simple to create circular dependencies and infinite loops
    - even if those loops do not occur in the same frame
- Streams are anonymous, and recursive
    - It can be hard to trace the propagation of values in a debugger
    - and therefore hard to diagnose bugs or performance issues.
- There quickly becomes a problem where you do not know what values should be wrapped, single properties, entire objects, entire state trees?  Each has trade offs, there is no clear path.

Zed on the other hand:

- Zed state is centralized, there is only 1 source of truth for all queries, and because it is mutable, there is no value propagation.
- A given Zed query is stateless, so multiple query instances have no need to be aware of eachother
- Because side effects occurs in transactions;
    - and because duplicate transactions for the same service are impossible;
    - and because writes prior to a commit are discarded:
    - it is a lot easier to answer who/what/when/how/why questions regarding state changes
- Every query and service has a human readable name.  This makes debugging much easier.
- In Zed the entire state tree is stored as a normal JS object, but you get the experience of convenient wrapped values for individual properties - best of both worlds.

## But I need to keep using streams with Zed

Using streams with Zed is possible.  You can subscribe to a stream and write it back to the Z state tree.  And when the Z state tree occurs, write back to another stream.

```js

let z = new Z()

z.state.a = 0
z.state.b = 0

// z.state.a is the source of truth for a
let a = stream(z.state.a) 

// when a changes, propagate it to the stream
z.service([z.state.a], function * (){
    a(z.state.a())
})

// this stream is the source of truth for b
let b = stream(2)

// when b changes, update b in the z tree
b.map( z.state.b )

// The stream computes the sum
let sum = stream.merge([a,b]).map( ([a,b]) => a+b )

// and we can write the sum to the z tree
sum.map( z.state.sum )

z.state.a = 4

b(3)

z.state.sum() // 7
sum() // 7

z.state.b // 3
```

It is recommended when mixing Z with Streams to make streams only the source, or the sink, not both.

## Taking advantage of the fact state is mutable and centralized

Because Zed state is mutable and centralized, you can do crazy things when trying to interop with other libraries.  For example, using JS getter/setters

Let's revise the above example:


```js

let a = stream(1)
let b = stream(2)

let sum = stream.merge(([a,b]) => a + b )

let z = new Z({
    state: {
        set b(x){
            b(x)
            return x
        }
        get b(){
            return b()
        }
        get sum(){
            return sum()
        }
        set a(x){
            a(x)
            return x
        }
        get a(){
            return a()
        }
    }
})

// now z is simply an interface into our streams

z.state.a()
// 1

z.state.a = 4
a()
// 4

b(5)
z.state.b()
// 5

sum()
// 9

z.state.sum(10)
// Error: 🛑 Cannot write to read only property
```

Z doesn't own the state tree, you do.  But it will only know about changes that occur through its own API.  So use this power wisely.

## Should I remove all streams from my app and just use Zed?

Depending on how often you use streams in your app, it may be challenging to switch cold turkey as the programming model isn't exactly the same.  But Zed and streams overlap, they solve the same problem.  And if I thought streams were better at solving state management in client side apps, I never would have made Zed.

My advice would be use the techniques above to migrate to Zed in stages.  Try to make Zed the default, but support the old stream API's until you can completely update all consumers.