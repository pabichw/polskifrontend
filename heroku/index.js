// @ts-check
import Http from 'http';

import Algoliasearch from 'algoliasearch';
import pg from 'pg';
import AllHtmlEntities from 'html-entities';
import Xss from 'xss';

import createSubscriber from 'pg-listen';
const { Pool } = pg;

const subscriber = createSubscriber({ connectionString: process.env.DATABASE_URL });

const client = Algoliasearch(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_API_SECRET);
const algoliaIndex = client.initIndex(process.env.ALGOLIA_INDEX_NAME);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

/**
 * @typedef {{
    id: string,
    title: string,
    href: string,
    description: string | null,
    publishedAt: Date,
    slug: string,
    blogId: string,
    createdAt: Date,
    updatedAt: Date,
  }} Article
 */

/**
 * @param {{channel: string, payload?: string}} args
 */
function handleNotification({ channel, payload }) {
  console.log({ channel, payload });
  switch (channel) {
    case 'INSERT.Article':
    case 'UPDATE.Article':
      return pool
        .query('SELECT * FROM "Article" WHERE id=$1;', [payload])
        .then((result) => {
          const indices = result.rows.map(
            /**
             * @param {Article} article
             */
            (article) => {
              const { id: objectID, description, title, createdAt, updatedAt, ...data } = article;
              return {
                ...data,
                description: AllHtmlEntities.decode(
                  Xss(description, { stripIgnoreTag: true, whiteList: {} }),
                ),
                title: AllHtmlEntities.decode(Xss(title, { stripIgnoreTag: true, whiteList: {} })),
                objectID,
              };
            },
          );
          return algoliaIndex.saveObjects(indices, { autoGenerateObjectIDIfNotExist: false });
        })
        .catch(console.error);
    case 'DELETE.Article':
      return algoliaIndex.deleteObject(payload).catch(console.error);
    default:
      break;
  }
}

subscriber.events.on('notification', handleNotification);

subscriber.events.on('error', (error) => {
  console.error('Fatal database connection error:', error);
  process.exit(1);
});

process.on('exit', () => {
  void subscriber.close();
});

export async function connect() {
  await subscriber.connect();
  await Promise.all([
    subscriber.listenTo('INSERT.Article'),
    subscriber.listenTo('UPDATE.Article'),
    subscriber.listenTo('DELETE.Article'),
  ]);
}

connect()
  .then(() => console.log('Connected to postgres!'))
  .catch(console.error);

const server = Http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello, world!');
});

server.listen(Number(process.env.PORT || 5000), () => {
  console.log('Server running');
});
