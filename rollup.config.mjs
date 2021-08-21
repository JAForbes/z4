import path from 'path'
import cp from 'child_process'
import common from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import {terser} from 'rollup-plugin-terser'
import {babel} from '@rollup/plugin-babel'

cp.execSync('rm -rf dist || true')

export default [
    { format: 'umd'
    , dir: './dist'
    , extension: '.umd.js'
    , sourcemap: true
    , input: 'z.js'
    , plugins: [] 
    }
    , 
    { format: 'umd'
    , dir: './dist'
    , extension: '.umd.min.js'
    , sourcemap: true
    , input: 'z.js'
    , plugins: [babel({ babelHelpers: 'bundled' }), terser()] 
    }
    , 
    { format: 'esm'
    , dir: './dist'
    , extension: '.esm.js'
    , sourcemap: true
    , input: 'z.js'
    , plugins: [] 
    }
    , 
    { format: 'esm'
    , dir: './dist'
    , extension: '.esm.min.js'
    , sourcemap: true
    , input: 'z.js'
    , plugins: [babel({ babelHelpers: 'bundled' }), terser()] 
    }
]
.map( 
    ({ format, dir, extension, sourcemap, input, plugins }) => {

        const defaultPlugins = [
            common()
            ,resolve()
        ]

        const filename = 'z4' + extension

        const config = {
            plugins: defaultPlugins.concat(plugins)
            ,input
            ,output: {
                name: format == 'umd' ? 'Z4' : undefined
                ,sourcemap
                ,format
                ,file: path.resolve(dir, filename)
                ,exports: 'default'
            }
        }

        return config
    }
)