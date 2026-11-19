"""Offline, group-disjoint risk/coverage check for a frozen review policy.

No dataset construction, inferred human labels, clinical approval, or DB writes.
A finite-sample upper bound assumes independent, representative patient groups.
"""
import math
from .confidence import VERSION


def error_upper(errors, count, alpha=.05):
    """One-sided exact binomial (Clopper-Pearson) upper confidence bound."""
    if not 0 < alpha < 1 or not 0 <= errors <= count:
        raise ValueError('Invalid error counts or alpha')
    if not count or errors == count:
        return 1.0
    if errors == 0:
        return -math.expm1(math.log(alpha)/count)

    def cdf(p):
        logs=[math.lgamma(count+1)-math.lgamma(k+1)-math.lgamma(count-k+1)
              +k*math.log(p)+(count-k)*math.log1p(-p) for k in range(errors+1)]
        peak=max(logs)
        return math.exp(peak)*sum(math.exp(x-peak) for x in logs)

    low,high=errors/count,1.0
    for _ in range(70):
        middle=(low+high)/2
        if cdf(middle)>alpha:low=middle
        else:high=middle
    return (low+high)/2


def metrics(rows, threshold, alpha=.05):
    selected=[r for r in rows if threshold is not None and r['score']>=threshold
              and not r.get('blockers') and not r.get('placeholder')]
    groups={}
    for r in selected:
        groups[r['patient_group']]=groups.get(r['patient_group'],False) or not r['correct']
    errors=sum(not r['correct'] for r in selected)
    return dict(total=len(rows),selected=len(selected),
        coverage=len(selected)/len(rows) if rows else 0,
        manual_review_fraction=1-len(selected)/len(rows) if rows else None,
        selected_errors=errors,selected_error_rate=errors/len(selected) if selected else None,
        selected_patient_groups=len(groups),patient_groups_with_error=sum(groups.values()),
        group_error_upper=error_upper(sum(groups.values()),len(groups),alpha))


def evaluate(dataset, *, max_group_error=.01, alpha=.05):
    if not 0 < max_group_error < 1 or not 0 < alpha < 1:
        raise ValueError('Targets must be between zero and one')
    if dataset.get('confidence_version')!=VERSION or not dataset.get('extraction_fingerprint'):
        raise ValueError('Bind labels to the current confidence version and extraction fingerprint')
    rows=dataset.get('samples',[])
    if not isinstance(rows,list):raise ValueError('Samples must be a list')
    seen=set();partitions={'calibration':[],'validation':[]};groups={}
    for r in rows:
        if (not isinstance(r,dict) or not r.get('sample_id') or r['sample_id'] in seen
                or not r.get('patient_group') or r.get('partition') not in partitions
                or r.get('human_verified') is not True or not r.get('reviewer')
                or r.get('sampling_strategy')!='random_audit' or type(r.get('correct')) is not bool
                or type(r.get('score')) not in (int,float) or not 0<=r['score']<=100
                or not isinstance(r.get('blockers',[]),list)):
            raise ValueError('Use unique, explicitly human-labelled random-audit samples with valid scores')
        partition=r['partition'];group=r['patient_group']
        if group in groups and groups[group]!=partition:
            raise ValueError('The same patient group cannot appear in calibration and validation')
        groups[group]=partition;seen.add(r['sample_id']);partitions[partition].append(r)
    training=partitions['calibration'];testing=partitions['validation']
    thresholds=sorted({r['score'] for r in training if r['score']>=80})
    threshold=next((t for t in thresholds if metrics(training,t,alpha)['group_error_upper']<=max_group_error),None)
    fit=metrics(training,threshold,alpha);validation=metrics(testing,threshold,alpha)
    passes=threshold is not None and bool(testing) and validation['selected']>0 and validation['group_error_upper']<=max_group_error
    return dict(schema_version='review-risk-calibration-1',confidence_version=VERSION,
        extraction_fingerprint=dataset['extraction_fingerprint'],threshold=threshold,
        max_group_error=max_group_error,confidence_level=1-alpha,
        calibration=fit,validation=validation,
        status='validated_candidate_threshold' if passes else 'insufficient_validation',
        probability_correct=None,automatic_approval_enabled=False,
        assumptions='Independent representative patient groups; labels and random sampling must be verified externally.',
        note='This report measures group error risk and workload, not per-field probability. It never changes review decisions.')
