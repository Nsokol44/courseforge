import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { anthropic, MODEL } from '@/lib/ai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { courseId, weekId, weekNumber, topic, courseTitle, activityDescription, toolPreferences } = await req.json()
    if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })

    const pythonEnv = toolPreferences?.python_env || 'Google Colab'
    const gis = toolPreferences?.gis_software || 'QGIS'
    const isColab = pythonEnv === 'Google Colab'

    const prompt = `Generate a complete, runnable Jupyter notebook for this GIS course activity.

Course: ${courseTitle}
Week ${weekNumber}: ${topic}
Activity description: ${activityDescription || topic}
Python environment: ${pythonEnv}
GIS software context: ${gis}

Return a JSON object representing a complete .ipynb notebook. Use this EXACT structure — nothing outside the JSON:

{
  "nbformat": 4,
  "nbformat_minor": 0,
  "metadata": {
    "colab": {"provenance": []},
    "kernelspec": {"name": "python3", "display_name": "Python 3"},
    "language_info": {"name": "python"}
  },
  "cells": [...]
}

The cells array must contain:

1. A markdown cell with: course title, week number, topic, and 2-3 sentence learning objective
2. A code cell: install packages (geopandas, matplotlib, shapely, contextily, folium) + imports + np.random.seed
3. A markdown cell: "Section 2: [Data/Scenario Setup]" with 2-3 sentences explaining the data or scenario
4. A code cell: create synthetic data relevant to "${topic}" (use numpy/geopandas to build realistic spatial data — NO external file dependencies, everything self-contained and runnable in Colab)
5. A markdown cell: "Section 3: Exploratory Mapping" with explanation
6. A code cell: matplotlib maps showing the data (2-3 subplots, proper titles, legends, colormaps)
7. A markdown cell: "Section 4: Analysis" with explanation of the spatial analysis
8. A code cell: the core spatial analysis (buffers, joins, overlays, etc. relevant to the topic)
9. A markdown cell: "Section 5: Results and Visualization" 
10. A code cell: final policy/results map with meaningful interpretation printed to console
11. A markdown cell: "Section 6: Practice Questions and Exercises" 
12. Then 3-4 question pairs: each is (a) markdown cell with question prompt ending in "*Your answer here...*", (b) code cell with "# YOUR CODE HERE\\n" placeholder
13. Final markdown cell with discussion post tie-in question

Rules for code cells:
- All data must be SYNTHETIC and self-contained — no file reads, no API calls
- Every code cell must run successfully in isolation after the setup cell
- Add print statements with emojis showing progress (✅ 📊 📍 🗺️)
- Use realistic domain-specific values for ${topic}
- Practice questions must require modifying earlier code (parameter sensitivity, weight changes, new scenarios)
- Code should match the style of Dr. Sokol's notebooks: clear section headers with =====, numpy random data, geopandas GeoDataFrames, matplotlib subplots

JSON only. Start with {. End with }.`

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,  // Notebooks are code-heavy; 4000 generates a solid 6-8 cell notebook
      system: `You are an expert GIS educator generating Jupyter notebooks for university courses. 
You always return valid JSON representing a complete .ipynb file. 
No markdown fences, no text outside the JSON object.
All Python code must be syntactically correct and runnable in ${isColab ? 'Google Colab' : 'Jupyter'}.
Use GeoPandas, Matplotlib, Shapely, and NumPy. Create fully synthetic spatial datasets.`,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (response.content.find(b => b.type === 'text') as any)?.text || ''
    if (!raw) {
      console.error('generate-notebook: empty response from Claude')
      return NextResponse.json({ error: 'AI returned empty response. Please try again.' }, { status: 422 })
    }

    // Extract and validate the notebook JSON
    let notebook: any
    try {
      // Strip any accidental fences
      const cleaned = raw
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
      notebook = JSON.parse(cleaned)
      if (!notebook.cells || !Array.isArray(notebook.cells)) throw new Error('Invalid notebook structure')
    } catch (e) {
      // Try balanced brace extraction
      const firstBrace = raw.indexOf('{')
      if (firstBrace === -1) {
        console.error('No JSON found in response:', raw.slice(0, 300))
        return NextResponse.json({ error: 'Could not generate notebook. Please try again.' }, { status: 422 })
      }
      try {
        notebook = JSON.parse(raw.slice(firstBrace))
      } catch {
        return NextResponse.json({ error: 'Notebook generation failed. Please try again.' }, { status: 422 })
      }
    }

    // Ensure required metadata fields
    notebook.nbformat = notebook.nbformat || 4
    notebook.nbformat_minor = notebook.nbformat_minor || 0
    notebook.metadata = notebook.metadata || {
      colab: { provenance: [] },
      kernelspec: { name: 'python3', display_name: 'Python 3' },
      language_info: { name: 'python' },
    }

    // Normalize cells — ensure all have proper structure
    notebook.cells = (notebook.cells || []).map((cell: any) => ({
      cell_type: cell.cell_type || 'code',
      metadata: cell.metadata || {},
      source: Array.isArray(cell.source) ? cell.source : [cell.source || ''],
      ...(cell.cell_type === 'code' || !cell.cell_type ? {
        execution_count: null,
        outputs: cell.outputs || [],
      } : {}),
    }))

    // Save the generated notebook JSON to the python_activities table
    if (weekId && courseId) {
      const notebookStr = JSON.stringify(notebook, null, 2)
      await supabase.from('python_activities').upsert({
        course_id: courseId,
        user_id: user.id,
        title: `Week ${weekNumber}: ${topic} — Python Notebook`,
        week: `Week ${weekNumber}`,
        description: activityDescription || `Interactive Python notebook for ${topic}`,
        code: notebookStr,  // store full notebook JSON in code field
      }, { onConflict: 'course_id,week' })
    }

    return NextResponse.json({ notebook })
  } catch (err: any) {
    console.error('generate-notebook error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
