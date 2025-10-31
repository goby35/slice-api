import { createHash } from 'crypto';

const sha256 = (input: string): string => {
  return createHash('sha256').update(input).digest('hex');
};

export default sha256;
