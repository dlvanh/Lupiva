"""Conservative catalogue aliases for otherwise unmapped API laboratory rows."""
from collections import defaultdict
import re

from .lab_api import CBC_MARKER, CBC_LABEL, NON_BLOOD_CONTEXT, PANEL_CODES
from .layout_context import explicit_panel
from .metadata import fold
from .rules import RULES, key


class CatalogAliases:
    def __init__(self, dictionary):
        self.fields = {field['field_id']: field for field in dictionary['fields']}
        self.aliases = defaultdict(set)
        self.units = {unit for field in dictionary['fields'] for component in field['components']
                      for unit in component.get('allowed_units', []) if unit}
        for field in dictionary['fields']:
            if (field['field_id'].startswith('HEM') or any(c['value_type'] in ('lab_result', 'panel_result')
                                                        for c in field['components'])):
                for alias in self.forms(field['label']):
                    self.aliases[alias].add(field['field_id'])
        # Reuse the exact local CBC aliases. Panel aliases also retain collisions
        # when the catalogue spells one duplicate with a suffix such as "protein".
        for rule in RULES:
            # Rules that only hold inside a non-blood specimen section (urine cells)
            # are mapped by the explicit urine branch in match(), never generically.
            if rule['field_id'] in self.fields and rule.get('specimen') in (None, 'blood'):
                for alias in rule['aliases']:
                    self.aliases[alias].add(rule['field_id'])

    def forms(self, label):
        text = fold(label).strip()
        variants = {text, re.sub(r'\([^()]*\)|\[[^\[\]]*\]', ' ', text).strip()}
        # Generic Vietnamese request prefixes ("quantification of", "test for")
        # do not name an analyte; also try the remainder.
        for variant in tuple(variants):
            stripped = re.sub(r'^(?:dinh\s+luong|xet\s+nghiem|do)\s+', '', variant)
            if stripped != variant:
                variants.add(stripped)
        for variant in tuple(variants):
            for unit in self.units:
                variants.add(re.sub(r'\s+' + re.escape(fold(unit)) + r'\s*$', '', variant))
        return {key(variant) for variant in variants if key(variant)}

    def panel_mismatch(self, row):
        """True when an API panel code (ANA/MYO) contradicts the printed antigen name."""
        field = row.get('field_id') or ''
        if not field.startswith(tuple(PANEL_CODES.values())) or field not in self.fields:
            return False
        label = re.sub(r'^.*?[:–—-]\s*(?=\S)', '', row.get('source_label') or '') if explicit_panel(
            row.get('source_label') or '') else (row.get('source_label') or '')
        forms = self.forms(label)
        candidates = set().union(*(self.aliases[alias] for alias in forms))
        if candidates:
            return field not in candidates
        # Unknown short antigen codes (e.g. a two-letter antigen absent from the
        # catalogue) must not borrow a neighbouring catalogue code.
        own = self.forms(self.fields[field]['label'])
        compact = re.sub(r'[^a-z0-9]', '', fold(label))
        return len(compact) <= 4 and not any(compact == re.sub(r'[^a-z0-9]', '', f) for f in own)

    def match(self, row, extraction):
        if row.get('field_id') is not None:
            return None
        # Context may be supplied at row or table/extraction scope. Never assume
        # that a familiar blood abbreviation overrides an explicit specimen.
        context_keys = ('specimen', 'specimen_raw', 'specimen_context', 'table_context',
                        'table_heading', 'section_heading', 'table_kind', 'source_header', 'source_label')
        context = ' '.join(str(source.get(name) or '') for source in (row, extraction) for name in context_keys)
        specimens = [item for item in extraction.get('specimens', [])
                     if item.get('checkbox_state') != 'unchecked']
        context += ' ' + str(specimens)
        folded = fold(context + ' ' + str(row.get('warning') or ''))
        if re.search(r'\b(?:urine|nuoc\s+tieu|urinalysis)\b', folded) and not re.search(r'\b(?:stool|phan)\b', folded):
            # Urine microscopy cells map to the renal CRF fields only with
            # explicit urine context; the value itself is never changed.
            cell = fold(row.get('source_label') or '').strip(' :')
            target = ('REN02' if re.fullmatch(r'(?:hong\s+cau|rbc|ery(?:throcytes?)?)', cell) else
                      'REN03' if re.fullmatch(r'(?:bach\s+cau|wbc|leu(?:kocytes?)?)', cell) else None)
            if target in self.fields and row.get('component', 'result') == 'result':
                return target, 'result'
            # Model-written warnings only add urine-cell evidence; they never
            # block other analytes. Printed context is still checked below.
        if (NON_BLOOD_CONTEXT.search(fold(context))
                or re.search(r'\b(?:urine|stool|faeces|feces)\b', fold(context))):
            return None
        label = row.get('source_label') or ''
        panel = explicit_panel(label)
        if panel:
            # Only an explicit prefix on this row can disambiguate a panel.
            prefix = re.match(r'^(?:ana\s*(?:profile\s*)?23|panel\s+ana(?:\s*23)?|'
                              r'(?:panel\s+)?myositis|(?:panel\s+)?viem\s+da\s+co'
                              r'(?:\s+tu\s+mien)?(?:\s+16\s*ag)?)\s*[:–—-]\s*(.+)$', fold(label))
            if not prefix or panel not in PANEL_CODES:
                return None
            label = prefix[1]
        candidates = set().union(*(self.aliases[alias] for alias in self.forms(label)))
        marker = CBC_MARKER.search(label)
        if marker:
            candidates.update(self.aliases[key(marker[1])])
        if panel:
            candidates = {field for field in candidates if field.startswith(PANEL_CODES[panel])}
        if len(candidates) != 1:
            return None
        field = candidates.pop()
        component = row.get('component')
        allowed = {c['component_id'] for c in self.fields[field]['components']}
        if field.startswith('HEM') and allowed & {'absolute_count', 'percentage'}:
            differential = CBC_LABEL.search(label)
            if not differential:
                return None
            component = 'percentage' if differential[1] == '%' else 'absolute_count'
        return (field, component) if component in allowed else None
