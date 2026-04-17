const path = require('path')
module.exports = {
  name: 'dev-react',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'react') return path.resolve(__dirname, 'node_modules/react/cjs/react.development.js')
    if (id === 'react-dom') return path.resolve(__dirname, 'node_modules/react-dom/cjs/react-dom.development.js')
    if (id === 'react-dom/client') return path.resolve(__dirname, 'node_modules/react-dom/cjs/react-dom-client.development.js')
    if (id === 'react/jsx-runtime') return path.resolve(__dirname, 'node_modules/react/cjs/react-jsx-runtime.development.js')
  }
}
