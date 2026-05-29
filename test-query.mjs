import { QdrantClient } from '@qdrant/js-client-rest';

async function main() {
    const client = new QdrantClient({ url: 'http://192.168.0.163:6333' });
    const collectionName = 'memories_tr';

    const dummyVector = new Array(1024).fill(0.1); // Assuming 1024 for BGE/etc

    try {
        const results = await client.query(collectionName, {
            prefetch: [
                {
                    query: {
                        nearest: dummyVector,
                        mmr: { diversity: 0.2, candidates_limit: 20 }
                    },
                    limit: 20
                }
            ],
            query: {
                formula: {
                    sum: [
                        "$score",
                        {
                            mult: [
                                0.0001,
                                "turn"
                            ]
                        }
                    ]
                },
                defaults: { turn: 0 }
            },
            limit: 5,
            with_payload: true,
        });
        console.log('Query success:');
        console.log(JSON.stringify(results, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2).substring(0, 500));
    } catch (err) {
        console.error('Query failed:', err.message);
        console.error(err.data || err.response?.data || err);
    }
}
main();
