import Koa = require('koa');
import { ApolloServer } from 'apollo-server-koa';
import schema from './schema';
const app = new Koa();


const server = new ApolloServer({
    schema,
    introspection: true
});


server.applyMiddleware({ app });

app.listen(process.env.PORT || 3030);
