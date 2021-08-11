import test from 'tape'
import Z from './z.js'


test('keys', t => {
    
    let z = new Z()

    t.equals(
        z.state.a.b.c.$.path.key
        , 'a.b.c', 'Basic key'
    )
    t.equals(
        z.state.a.b.c.$values.$filter( (x,y) => x.id == y, [z.state.id])
            .$.path.key
        , 'a.b.c.$values.$filter((x,y) => x.id == y, [id])', 'Complex key'
    )
    t.end()
})

test('get', t => {

    let z = new Z()

    t.doesNotThrow( () => z.state(), 'Can access root state object')

    z.state.a.b.c.d = 4
    t.equals(z.state.$.state.a.b.c.d, 4, 'Nested set')
    
    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]
    z.state.id = 2
    t.equals(z.state.users.$values.$all().map( x => x.id ).join('|'), '1|2|3', '$values get')
    t.equals(z.state.users.$values.$map( x => x.id + 1 ).$all().join('|'), '2|3|4', '$map get')

    t.equals(z.state.users.$values.$filter( x => x.id == 2 )().id, 2, '()')

    t.equals(z.state.users.$values.$filter( x => x.id == 2 ).valueOf().id, 2, 'valueOf')
    t.end()
})

test('set', t => {
    let z = new Z()
    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]
    z.state.id = 3

    t.equals(z.state.$.state.id, 3, 'value')
    t.equals(z.state.$.state.users.map( x => x.id ).join('|'), '1|2|3', 'list')

    z.state.id(5)
    t.equals(z.state.$.state.id, 5, 'value')

    z.state.id(x => x - 1)
    t.equals(z.state.$.state.id, 5 -1, 'fn')

    t.end()
})

test('delete', t => {
    let z = new Z()
    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]

    delete z.state.users.$values
    t.equals(z.state.$.state.users.length, 0, 'clear list')

    delete z.state.users
    t.equals(z.state.$.users, undefined, 'delete list')

    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]

    z.state.users.$values.$filter( x => x.id > 1 ).$delete()
    t.equals(z.state.$.state.users.map( x => x.id ).join('|'), '1', 'delete matching elements')

    z.state.x = 1
    delete z.state.x

    t.equals(z.state.$.state.x, undefined, 'Normal property delete')

    t.end()
})

test('dependencies', t => {
    let z = new Z()
    let user = z.state.users
        .$values
        .$filter( (x,y) => x.id == y, [z.state.id] )

    z.state.users = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }]
    z.state.id = 2

    t.equals(user().id, 2, 'Filter with dependencies works')

    z.state.symbol = '!!!'
    let yell = z.state.users
        .$values
        .$map( (x,y) => ({ ...x, name: x.name + y }), [z.state.symbol] )
        
    t.equals(yell.$all().map( x => x.name ).join('|'), 'a!!!|b!!!|c!!!')
    t.end()
})

test('simple subscriptions', t => {
    let z = new Z()
    
    let called = { user: 0, users: 0, friend: 0 }
    
    z.on([z.state.users], () => called.users++)
    
    let user = z.state.users
        .$values
        .$filter( (x,y) => x.id == y, [z.state.friend.id] )

    
    z.on([user], function(){
        called.user++
    })
    t.equals(called.user, 0, 'Subscription not called.user when tree empty')
    
    z.state.users = [{ id: 1 }, { id: 2 }, { id: 3 }]

    t.equals(called.user, 0, 'Subscription not called.user when tree empty pt 2')
    z.state.friend.id = 2
    z.on([z.state.friend.id], () => called.friend++)

    t.equals(called.user, 1, 'Subscription called.user once all deps are ready')

    z.state.friend.id = 2
    t.equals(called.user, 1, 'Setting a value to itself does not dispatch a notification')

    let copy = z.state.users()
    z.state.users = copy
    t.equals(called.user, 1, 'Setting a value to itself does not dispatch a notification pt2')
    
    z.state.friend.id = 3
    t.equals(called.user, 2, 'Updating a dependency updates the notification')

    t.end()
})

// test('deferrable subscriptions')
// test('caching')