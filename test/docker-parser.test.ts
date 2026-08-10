import { describe, expect, test } from 'bun:test';
import { parseDockerCommand } from '../src/mcp/upstream/docker-parser';

describe('docker-parser', () => {
  test('parses the example command', () => {
    const cmd = 'docker run -i --rm -e EXPRESS_SERVER_URL=http://host.docker.internal:3000 -e ENABLE_CANVAS_SYNC=true ghcr.io/yctimlin/mcp_excalidraw:latest';
    const parsed = parseDockerCommand(cmd);
    
    expect(parsed.image).toBe('ghcr.io/yctimlin/mcp_excalidraw:latest');
    expect(parsed.env).toEqual({
      EXPRESS_SERVER_URL: 'http://host.docker.internal:3000',
      ENABLE_CANVAS_SYNC: 'true'
    });
    expect(parsed.inferredName).toBe('excalidraw');
    expect(parsed.command).toBeUndefined();
    expect(parsed.args).toBeUndefined();
  });

  test('parses command with volumes', () => {
    const parsed = parseDockerCommand('docker run -v /host/path:/container/path --volume /data node');
    expect(parsed.volumes).toEqual(['/host/path:/container/path', '/data']);
    expect(parsed.image).toBe('node');
  });

  test('name inference', () => {
    expect(parseDockerCommand('ghcr.io/yctimlin/mcp_excalidraw:latest').inferredName).toBe('excalidraw');
    expect(parseDockerCommand('node:22-alpine').inferredName).toBe('node');
    expect(parseDockerCommand('python:3.12-slim').inferredName).toBe('python');
    expect(parseDockerCommand('mcp-test@sha256:1234').inferredName).toBe('test');
  });

  test('trailing command and args', () => {
    const parsed = parseDockerCommand('docker run node bash -c "echo hello"');
    expect(parsed.image).toBe('node');
    expect(parsed.command).toBe('bash');
    expect(parsed.args).toEqual(['-c', 'echo hello']);
  });

  test('without docker run prefix', () => {
    const parsed = parseDockerCommand('-i --rm node index.js');
    expect(parsed.image).toBe('node');
    expect(parsed.command).toBe('index.js');
  });

  test('with --name', () => {
    const parsed = parseDockerCommand('docker run --name mycontainer node');
    expect(parsed.name).toBe('mycontainer');
    expect(parsed.image).toBe('node');
  });
});
