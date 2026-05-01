-- Sample SQL demonstrating DDL, DML, joins, aggregation, and subqueries.

-- ── Schema ────────────────────────────────────────────

CREATE TABLE departments (
    id          INTEGER PRIMARY KEY AUTO_INCREMENT,
    name        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employees (
    id              INTEGER PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    department_id   INTEGER NOT NULL,
    salary          DECIMAL(10, 2) CHECK (salary > 0),
    hire_date       DATE NOT NULL,
    active          BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_active ON employees(active);

-- ── Seed Data ─────────────────────────────────────────

INSERT INTO departments (name) VALUES
    ('Engineering'),
    ('Design'),
    ('Product'),
    ('Data');

INSERT INTO employees (name, email, department_id, salary, hire_date) VALUES
    ('Alice Johnson', 'alice@example.com', 1, 95000.00, '2024-01-15'),
    ('Bob Smith',     'bob@example.com',   2, 85000.00, '2024-02-01'),
    ('Charlie Brown', 'charlie@example.com', 3, 120000.00, '2023-06-10'),
    ('Diana Prince',  'diana@example.com', 1, 92000.00, '2024-03-20'),
    ('Eve Wilson',    'eve@example.com',   4, 88000.00, '2024-04-05');

-- ── Queries ───────────────────────────────────────────

-- Department headcount with average salary
SELECT
    d.name AS department,
    COUNT(e.id) AS headcount,
    ROUND(AVG(e.salary), 2) AS avg_salary
FROM departments d
LEFT JOIN employees e ON d.id = e.department_id AND e.active = TRUE
GROUP BY d.id, d.name
HAVING COUNT(e.id) > 0
ORDER BY avg_salary DESC;

-- Highest paid employee per department (subquery)
SELECT e.name, e.salary, d.name AS department
FROM employees e
JOIN departments d ON e.department_id = d.id
WHERE e.salary = (
    SELECT MAX(e2.salary)
    FROM employees e2
    WHERE e2.department_id = e.department_id
)
ORDER BY e.salary DESC;

-- Update: give 5% raise to Engineering
UPDATE employees
SET salary = ROUND(salary * 1.05, 2)
WHERE department_id = (SELECT id FROM departments WHERE name = 'Engineering')
  AND active = TRUE;

-- Delete: remove inactive employees
DELETE FROM employees WHERE active = FALSE;
