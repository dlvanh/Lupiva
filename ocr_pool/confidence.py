"""Bounded-memory generation signals, not probabilities of extraction accuracy."""
import math

VERSION = 'ocr-generation-signals-1'


def summarize(logprobs, margins):
    if not logprobs or len(logprobs) != len(margins):
        return None
    if any(not math.isfinite(x) or x > 1e-5 for x in logprobs):
        return None
    if any(not math.isfinite(x) or x < 0 for x in margins):
        return None
    probabilities = sorted(math.exp(min(0, x)) for x in logprobs)
    return dict(version=VERSION, granularity='region', token_count=len(logprobs),
        mean_logprob=sum(logprobs)/len(logprobs),
        geometric_mean_token_probability=math.exp(sum(logprobs)/len(logprobs)),
        p10_token_probability=probabilities[int((len(probabilities)-1)*.1)],
        low_probability_token_fraction=sum(p < .5 for p in probabilities)/len(probabilities),
        mean_top2_logit_margin=sum(margins)/len(margins),
        calibrated=False, probability_correct=None)


def greedy_collector():
    """Collect two scalars/step, retaining no vocabulary-sized output scores.

    The current recognizer uses one greedy sequence. Logits are returned
    unchanged, so capture cannot alter its selected tokens or raw text.
    """
    import torch
    from transformers import LogitsProcessor

    class Collector(LogitsProcessor):
        def __init__(self):
            self.values = []
            self.choices = []

        def __call__(self, input_ids, scores):
            if scores.shape[0] != 1:
                raise ValueError('Confidence capture supports one greedy sequence only')
            top, indices = torch.topk(scores.float(), 2, dim=-1)
            self.values.append(torch.stack((top[0, 0]-torch.logsumexp(scores.float(), dim=-1)[0],
                                            top[0, 0]-top[0, 1])).detach())
            self.choices.append(indices[0, 0].detach())
            return scores

        def finish(self, tokens):
            if not self.values or len(self.values) != len(tokens):
                return None
            if not torch.equal(torch.stack(self.choices), tokens):
                return None  # Do not attribute a top-1 signal to another token.
            values = torch.stack(self.values).cpu().tolist()
            return summarize([v[0] for v in values], [v[1] for v in values])

    return Collector()
