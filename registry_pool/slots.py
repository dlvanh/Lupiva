"""CRF slot identity shared by review and export code."""
import re


def parse_slot(slot):
    """Return (field_id, component, instance); legacy slots are instance one."""
    match = re.fullmatch(r'([^/]+)/([^/#]+)(?:#([1-9]\d*))?', slot)
    if not match:
        raise ValueError('Invalid CRF slot: ' + slot)
    field_id, component, number = match.groups()
    return field_id, component, int(number) if number else 1
