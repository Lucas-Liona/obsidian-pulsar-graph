# Pulsar Graph 💫

**Temporal visualization for your Obsidian knowledge graph.** Pulsar Graph adds time-based opacity to graph nodes, helping you visualize when notes were last modified at a glance.

![Pulsar Graph Demo](https://via.placeholder.com/800x400?text=ADD+DEMO+GIF+HERE)
<!-- TODO: Add animated GIF showing opacity changes with different fade types -->

---

## Features

### 🌟 Dynamic Node Opacity

Watch your graph come alive as node opacity reflects how recently they were modified:

- **Recent notes** appear bright and prominent
- **Older notes** fade into the background
- **Visual patterns** emerge showing your active knowledge areas

### 📊 Three Fade Functions

#### Linear Fade
- Smooth, even transition from old to new
- Best for: General use, even distribution across time

#### Exponential Fade
- Curved fade with adjustable steepness
- Best for: Emphasizing very recent work while keeping older notes visible
- Steepness slider: Control the curve intensity (0.1 - 10.0)

#### Step Fade
- Discrete opacity levels for clear categorization
- Best for: Distinct time periods (this week, this month, this quarter, etc.)
- Configurable steps: Choose 2-10 discrete opacity levels

![Fade Type Comparison](https://via.placeholder.com/800x300?text=ADD+COMPARISON+IMAGE+HERE)
<!-- TODO: Add side-by-side comparison of the three fade types -->

### ⚙️ Customization

- **Min/Max Opacity**: Set opacity range (0.0 - 12.0) to control visibility
- **Exponential Steepness**: Fine-tune the exponential curve (0.1 - 10.0)
- **Step Count**: Choose how many discrete levels for step mode (2-10)
- **Global & Local Graphs**: Works on both graph views

### ⚡ Performance Optimized

- **Intelligent Caching**: Opacity calculations cached and only recalculated when needed
- **Workspace-Aware**: Only runs when graph views are open (zero CPU when idle)
- **Efficient Updates**: Polls every 1 second without impacting graph performance

### 📝 Additional 

- Works with Local Graph and Global Graph View
- Works with Group Labels

---

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open **Settings** → **Community Plugins**
2. Click **Browse** and search for "Pulsar Graph"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Lucas-Liona/pulsar-graph/releases)
2. Create folder `VaultFolder/.obsidian/plugins/pulsar-graph/`
3. Copy the files into this folder
4. Reload Obsidian and enable the plugin in Settings → Community Plugins

---

## Usage

1. **Open your graph view** (global or local)
2. **Open Pulsar Graph settings** (Settings → Pulsar Graph)
3. **Choose your fade type** (Linear, Exponential, or Step)
4. **Adjust opacity settings** to your preference
5. **Watch your graph transform** - opacity updates automatically every second!

### Settings Guide

![Settings Panel](https://via.placeholder.com/600x400?text=ADD+SETTINGS+SCREENSHOT+HERE)
<!-- TODO: Add screenshot of settings panel with annotations -->

#### Fade Type
- Choose between Linear, Exponential, or Step fade functions

#### Minimum Opacity (0.0 - 1.0)
- Opacity for your oldest notes
- Lower values make old notes more transparent

#### Maximum Opacity (0.0 - 12.0)
- Opacity for your newest notes
- Values > 1.0 make recent notes brighter than normal

#### Steepness (Exponential mode only, 0.1 - 10.0)
- < 1.0: Gentle curve (keeps older notes more visible)
- = 1.0: Linear (same as Linear mode)
- \> 1.0: Steep curve (emphasizes very recent notes)

#### Number of Steps (Step mode only, 2-10)
- How many discrete opacity levels
- Example: 4 steps = 4 distinct time periods

---

## Use Cases

### 📚 Active Research Areas
Quickly identify which topics you're actively working on vs. archived knowledge

### 🔄 Project Activity
See which project notes are "hot" and which have gone dormant

### 🧹 Vault Maintenance
Spot neglected areas of your knowledge base that might need review

### 🎨 Visual Navigation
Use temporal depth as an additional dimension for navigating large graphs

---

## Tips & Tricks

- **Try different fade types** for different vaults - exponential works great for research vaults, step mode for project management
- **Adjust during review sessions** to highlight notes from specific time periods
- **Combine with filters** in the graph view for powerful visualization

---

## Performance

Pulsar Graph is designed to be lightweight:

- Caches all opacity calculations
- Only runs when graph views are open
- Updates asynchronously without blocking UI
- Tested on vaults with 500+ notes with no perceptible performance impact

---

## Compatibility

- **Minimum Obsidian Version**: 0.15.0
- **Platforms**: Desktop and Mobile
- **Graph Types**: Global Graph and Local Graph

---

## Roadmap

Planned features for future releases:

- [ ] Function visualization graph in settings (exponential, step, linear, or custom bezier curve)
- [ ] Time window settings (show last X days/months)
- [ ] Hot-node highlighting (spotlight most recently edited note)
- [ ] Custom color schemes for temporal visualization (style.css)
- [ ] Export graph as image with opacity applied
- [ ] Opacity can afffect Links/Titles, Tag Nodes?
- [ ] Show path of last visited files
- [ ] Put a 'native' settings tab directly on the graph view (with react)
- [ ] Ensure it works with other Graph plugins like 3D Graph and Extended Graph Plugins
- [ ] Hover note to see age
- [ ] Normalize to now V.S. Normalize to oldest-note (notes decay if you dont use vault V.S. note opacity is relative and always the same until you modify notes)

Maybe out of scope
- [ ] Scale node by length of content?
- [ ] Revisit X times streak mechanic (if you modify a note everyday for X days (or a set number of times like 5 in a day), it becomes golden) (this is more of a learning/goal-setting idea to see what notes you continually revisit)
- [ ] Group nodes by age?
- [ ] Smooth opacity across connected nodes by distance (i.e. notes of the same subject (maybe connected by an index), all get similiar opacities. This may be better for large vaults)
- [ ] Basic Statistics about usage. (
  i.e.
  Last note edited: 1 Day - DifferentialEquations.md
  Oldest Note: 416 Days - HomePage.md
  Average Note: 30 Days Old
)

Note*: This is currently a pet-project MVP that I wanted for myself, and decided to create. I focused on being fast, critically safe, and doing 1 thing well (making the graph more accessible and easy to read). I want to see what people want because I personally think this is cool and can go a bunch of different ways.

---

## Support

Found a bug or have a feature request?

- **Issues**: [GitHub Issues](https://github.com/Lucas-Liona/pulsar-graph/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Lucas-Liona/pulsar-graph/discussions)

---

## Development

Want to contribute? Check out the development guide:

```bash
# Clone the repo into your vault's plugins folder
cd VaultFolder/.obsidian/plugins/
git clone https://github.com/Lucas-Liona/pulsar-graph.git
cd pulsar-graph

# Install dependencies
npm install

# Build the plugin
npm run build

# Or run in watch mode for development
npm run dev
```

---

## License

[MIT License](LICENSE)

---

## Acknowledgments

Built with the [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)

---

**Enjoying Pulsar Graph?** Consider [buying me a coffee](https://buymeacoffee.com) or starring the repo!
