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