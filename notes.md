Cache all values, not just dynamics

And cache on set not just on read, because we know the read value after set

---

.$default

---

If value is cached, check in onbeforeset as well to prevent running the entire set just to find it won't happen

---

Need to make set exit if already set

And make delete return false if there is nothing to delete, so notifications don't happen

---

Do we need to handle indexOf returning -1?  I guess that is impossible.

--- 

When checking parents list we can have the index at the time the parent was stored, check that first, and only fall back to indexOf if the result was a primative value or if it was the wrong reference.  For a lot of queries the index we stored for the parent will be the correct index, saves a (hidden) loop

---

The first write can just mutate the result of the previous cached get (if there is a cache).

Only the second write needs to run the full set loop.

And there should be a way for a write to promise a mutation will not change the result of the filter.

But I guess the way to do that is a mutation.  But then notifications wouldn't fire.

---

Filter set doesn't do anything if its the finalOp we are just running an immutable visitor fn and storing it in an ephemeral list.

We need to do the parents + indexOf thing

---

Could make `get` exit early once we have a single result
as most of the time we are getting 1 value out of a query.

But this would only speed up get if the finalOp was a very long list

E.g. a pluck on a list of 1000 items where you only want one.

Instead of passing down that we only want 1, we could use a generator and yield per result.

`.$all` could be [...get()] and `query()` could be `get().next().value`

On that note, queries should be iterators.