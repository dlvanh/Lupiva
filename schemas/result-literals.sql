-- Literal transcription rules. Tokens are case- and accent-folded for lookup.
CREATE TABLE result_literals (
    version TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('result', 'colour')),
    token TEXT NOT NULL,
    PRIMARY KEY (scope, token)
);

INSERT INTO result_literals VALUES
    ('result-literals-1', 'result', 'negative'),
    ('result-literals-1', 'result', 'positive'),
    ('result-literals-1', 'result', 'borderline'),
    ('result-literals-1', 'result', 'am tinh'),
    ('result-literals-1', 'result', 'duong tinh'),
    ('result-literals-1', 'result', 'nghi ngo'),
    ('result-literals-1', 'result', '+'),
    ('result-literals-1', 'result', '++'),
    ('result-literals-1', 'result', '+++'),
    ('result-literals-1', 'result', '++++'),
    ('result-literals-1', 'result', '(+)'),
    ('result-literals-1', 'result', '(++)'),
    ('result-literals-1', 'result', '(+++)'),
    ('result-literals-1', 'result', '(++++)'),
    ('result-literals-1', 'colour', 'yellow'),
    ('result-literals-1', 'colour', 'vang');
