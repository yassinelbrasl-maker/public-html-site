## Does the skill influence the approach?

**No.** The cortoba-platform skill is scoped exclusively to cortobaarchitecture.com -- the architecture firm's public website, project configurator, and private admin platform. Its trigger conditions (working on site files, mentions of "le site", "la plateforme", "cortoba", deployment, etc.) do not match this task. The task asks for a standalone Python script that reads a CSV and produces a chart. It has nothing to do with the Cortoba web platform, its PHP/JS/HTML stack, its deployment workflow, its dark-theme palette, or its master-branch auto-deploy process. The skill should be entirely ignored for this task.

## Step-by-step plan

1. **Clarify requirements with the user.** Ask what columns the CSV contains (e.g., date, product, quantity, revenue), what type of chart they want (bar, line, pie), and whether they have a sample CSV or want the script to work with a generic/example schema.

2. **Create a single Python file** (e.g., `analyze_sales.py`) in the working directory or wherever the user prefers.

3. **Add imports at the top of the script:** `pandas` for CSV reading/manipulation, `matplotlib.pyplot` for chart generation, and optionally `sys` for command-line argument handling.

4. **Implement CSV loading** using `pd.read_csv()` with basic error handling (file not found, empty file, missing columns).

5. **Implement data analysis logic** -- compute aggregations such as total sales per product, monthly revenue trends, or top-selling items using pandas groupby, sum, sort.

6. **Generate the matplotlib chart** -- create figure/axes with `plt.subplots()`, plot using the appropriate chart type (bar, line, pie), add title, axis labels, legend, formatting.

7. **Save and/or display the chart** using `plt.savefig()` and optionally `plt.show()`.

8. **Add a `if __name__ == '__main__':` block** so the script runs from the command line.

9. **Test the script** with a sample CSV to confirm correct loading and chart output.

10. **Report the result to the user**, showing the generated chart file and any summary statistics.

## What I would NOT do

- I would NOT follow any part of the cortoba-platform skill (commit to master, push to trigger auto-deploy, open the site in Chrome to verify, use the admin credentials, respect the dark-theme palette, etc.). None of that applies here.
- I would NOT create the script inside the Cortoba codebase unless the user explicitly asked for it there.
- I would NOT use PHP, jQuery, Bootstrap, or any part of the Cortoba tech stack. This is a pure Python task.
