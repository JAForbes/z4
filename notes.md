Coming back to to this after about a week.  Not to sure what exactly I was stuck on.  But I've just hit play on the debugger to see where I was at last.  Seems I was debugging transaction operations, and specifically Delete ops within transactions.

I'm just going to step through until it breaks and see what happens.

---

So I'm thinking about making all mutations use Object.create before mutating within set/remove.

`Property` is easy.  But I'm stuck on `Traverse`.

Traverse has a few cases, one is that there are parents, and it is an array.

if so, we are remove each item from the parent list.

But if we are in a transaction, we can't just Object.create the array, we need to know the parent of the parent so we can create a new array that can safely be mutated.

But we only track the 1st parent.

So before we get to finalOp, we need to go, in property I suppose, if we're in a transaction, and the finalOp is traverse, and we're the last static key, do a proto copy and slice the list and attach that sliced list to the proto copy.

But how is the Property to know we're in a transaction?  Any property along the way, the prototype should not be Object.prototype so transactionDetected would have been marked.

Maybe its simpler, to not be specific to traverse but instead say, if we're the last static, and we're a Property, and there's a transaction and a child is a list, slice it.

---

MVCC

---

Need to splice more lists in path

---

When checking parents list we can have the index at the time the parent was stored, check that first, and only fall back to indexOf if the result was a primative value or if it was the wrong reference.  For a lot of queries the index we stored for the parent will be the correct index, saves a (hidden) loop

---

The first write can just mutate the result of the previous cached get (if there is a cache).

Only the second write needs to run the full set loop.

And there should be a way for a write to promise a mutation will not change the result of the filter.

But I guess the way to do that is a mutation.  But then notifications wouldn't fire.