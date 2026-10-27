import { runNetlify } from './_lib/run-netlify.js';
import handler from '../netlify/functions/admin-orders.mjs';

export default async (req, res) => runNetlify(req, res, handler);
