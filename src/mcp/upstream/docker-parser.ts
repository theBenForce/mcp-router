export interface ParsedDockerCommand {
  image: string;
  env: Record<string, string>;
  volumes: string[];     // ["/host:/container", ...]
  command?: string;      // trailing command after image
  args?: string[];       // trailing args
  name?: string;         // --name flag
  inferredName: string;  // derived from image basename
}

export function parseDockerCommand(cmdString: string): ParsedDockerCommand {
  // Simple tokenization for shell-like syntax
  const tokens = cmdString.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  let args = tokens.map(t => t.replace(/^["'](.*)["']$/, '$1'));

  // Strip 'docker run' prefix if present
  if (args.length >= 2 && args[0] === 'docker' && args[1] === 'run') {
    args = args.slice(2);
  }

  const result: ParsedDockerCommand = {
    image: '',
    env: {},
    volumes: [],
    inferredName: ''
  };

  // Expand short combined flags like -it into -i -t
  const expandedArgs: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-') && !arg.startsWith('--') && arg.length > 2) {
      for (let j = 1; j < arg.length; j++) {
        expandedArgs.push('-' + arg[j]);
      }
    } else {
      expandedArgs.push(arg);
    }
  }
  args = expandedArgs;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('-') && arg !== '-') {
      if (arg === '-e' || arg === '--env') {
        i++;
        if (i < args.length) {
          const [key, ...valParts] = args[i].split('=');
          result.env[key] = valParts.join('=');
        }
      } else if (arg === '-v' || arg === '--volume') {
        i++;
        if (i < args.length) {
          result.volumes.push(args[i]);
        }
      } else if (arg === '--name') {
        i++;
        if (i < args.length) {
          result.name = args[i];
        }
      } else if (arg === '-p' || arg === '--publish' || arg === '--network' || arg === '--user' || arg === '--workdir') {
        i++; // skip value for these known flags
      }
      i++;
    } else {
      // First positional arg is the image
      result.image = arg;
      i++;
      break;
    }
  }

  // Rest are command and args
  if (i < args.length) {
    result.command = args[i];
    result.args = args.slice(i + 1);
  }

  // Infer name from image
  if (result.image) {
    const parts = result.image.split('/');
    const basename = parts[parts.length - 1];
    const nameWithoutTag = basename.split(':')[0];
    const nameWithoutDigest = nameWithoutTag.split('@')[0];
    
    // strip mcp- or mcp_ prefix
    result.inferredName = nameWithoutDigest.replace(/^mcp[-_]/, '');
  }

  return result;
}
