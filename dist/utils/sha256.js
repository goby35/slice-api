import { createHash } from 'crypto';
const sha256 = (input) => {
    return createHash('sha256').update(input).digest('hex');
};
export default sha256;
