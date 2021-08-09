import test from 'tape'
import Z from './z.js'


test('keys', t => {
    
    let z = Z()
    t.equals(
        z.state.a.b.c.$.path.key
        , 'a.b.c', 'Basic key'
    )
    t.equals(
        z.state.a.b.c.$values.$filter( (x,y) => x.id == y
        , [z.state.id]).$.path.key, 'a.b.c.$values.$filter((x,y) => x.id == y, [id])', 'Complex key'
    )
    t.end()
})

test('get', t => {

    let z = Z()
    z.state.a.b.c.d = 4
    t.equals(z.state.$.state.a.b.c.d, 4, 'Nested set')
    
    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]
    z.state.id = 2
    t.equals(z.state.users.$values.$all().map( x => x.id ).join('|'), '1|2|3', '$values get')
    t.equals(z.state.users.$values.$map( x => x.id + 1 ).$all().join('|'), '2|3|4', '$map get')

    t.equals(z.state.users.$values.$filter( x => x.id == 2 )().id, 2, '')
    t.end()
})

test('set', t => {
    let z = Z()
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
    let z = Z()
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