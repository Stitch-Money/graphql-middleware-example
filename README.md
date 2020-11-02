## Introduction
This repository serves as an example of how to leverage the unique features of GraphQL to neatly encapsulate cross cutting concerns. The example was prepared for a [soapbox](https://en.wikipedia.org/wiki/Soapbox) held at Stitch on the 4th of November 2020. 

The slides for the presentation can be found [here](https://docs.google.com/presentation/d/1WTfeStLA-onMcPLShhaVsxbkbg5E_g14dZOYpMojiFI/edit?usp=sharing). 

The talk first briefly explains the nature of GraphQL and how a GraphQL request is typically evaluated. It then proceeds to take an existing GraphQL API and rewrite the resolvers to add formatting options to `String` fields using [GraphQL Compose](https://graphql-compose.github.io/). 

## Running this example

```bash
npm install
npm run watch
```

