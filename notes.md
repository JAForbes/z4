Generators are essential for MVCC because it allows Z to call it.throw()/it.return() no matter what is happening.

E.g. if committing a transaction causes the dispatch of another transaction of the same ilk, based on the options given by the user the existing transaction could be aborted in favor of the new one, the new transaction could be cancelled, the new transaction could delay execution until the current transaction exits cleanly.  

If we are just relying on rollback when an exception originates inside the transaction context, we can't cancel a transaction generically.

---

When resolving a transaction changeset to the main tree, should I clear the cachedValues every write?

If so, why store the cached value per write, if we are just going to clear it in a moment.

Effectively the cache is only useful when only 1 write is occur, but for a series of batched writes, we cannot rely on it.  The cache could become stale after each write.  So calling onset is a bad idea.

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