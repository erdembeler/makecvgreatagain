import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWithOllama, ollamaStatus } from '../server/ollama';
import { demo } from '../shared/demo';

afterEach(() => mock.restoreAll());
const localTags = () =>
  Response.json({ models: [{ name: process.env.OLLAMA_MODEL || 'llama3.2' }] });

test('local AI sends source as untrusted data with a structured output schema', async () => {
  mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    const target = new URL(url);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
    if (target.pathname === '/api/tags') return localTags();
    assert.equal(target.pathname, '/api/chat');
    const request = JSON.parse(String(options.body));
    assert.equal(request.stream, false);
    assert.deepEqual(request.format.required, ['name', 'headline', 'contacts', 'sections']);
    assert.match(request.messages[0].content, /untrusted source data/);
    assert.equal(request.messages[1].content, 'Fictional source CV');
    return Response.json({ message: { content: JSON.stringify(demo) } });
  });
  const result = await extractWithOllama('Fictional source CV');
  assert.equal(result.name, demo.name);
  assert.deepEqual(
    result.sections.map((s) => s.content),
    demo.sections.map((s) => s.content),
  );
  assert.equal(new Set(result.sections.map((s) => s.id)).size, result.sections.length);
});

test('malformed and empty AI responses are rejected', async () => {
  const mocked = mock.method(globalThis, 'fetch', async (url: string) =>
    url.endsWith('/api/tags') ? localTags() : Response.json({ message: { content: 'not JSON' } }),
  );
  await assert.rejects(extractWithOllama('Fictional source CV'));
  mocked.mock.mockImplementation(async (url: string) =>
    url.endsWith('/api/tags')
      ? localTags()
      : Response.json({ message: { content: JSON.stringify({ ...demo, sections: [] }) } }),
  );
  await assert.rejects(extractWithOllama('Fictional source CV'), /geçerli CV/);
});

test('inference HTTP failures remain errors for the importer fallback', async () => {
  mock.method(globalThis, 'fetch', async (url: string) =>
    url.endsWith('/api/tags') ? localTags() : new Response('unavailable', { status: 503 }),
  );
  await assert.rejects(extractWithOllama('Fictional source CV'), /Yerel AI yanıt vermedi/);
});

test('missing Ollama server is reported as unavailable', async () => {
  mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('connection refused');
  });
  assert.equal((await ollamaStatus()).available, false);
});

test('cloud models with innocent local aliases are blocked before any CV leaves the app', async () => {
  let chatRequests = 0;
  mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/api/chat')) chatRequests++;
    return Response.json({
      models: [
        {
          name: process.env.OLLAMA_MODEL || 'llama3.2',
          remote_host: 'https://ollama.com',
          remote_model: 'remote-model',
        },
      ],
    });
  });
  const status = await ollamaStatus();
  assert.equal(status.available, false);
  await assert.rejects(extractWithOllama('Private source data'), /Bulut modelleri/);
  assert.equal(chatRequests, 0);
});
