# Goals

There are some goals I wanted to hit when writing Z4, and explains some of the reasons I've worked on this for so long instead of using other available options.

## Cached queries

I want to be able to query the state in the view, without defining the query ahead of time.

E.g. if I want the user from the users list that matches the current user_id in the route, I want to be able to query that every render and for that to create a new query every render, but instead reference the query from the first render.

To do that, we need queries to have an identity.  Which is why every query has an automatic key which largely is determined by what you are accessing in the state tree.

There should be no situation where we avoid queries because it may affect performance.  We want to use queries because we want performance.