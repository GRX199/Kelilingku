const fs = require("fs");
const path = require("path");

function generateTree(dir, prefix = "", ignore = ["node_modules", ".git", "dist"]) {
  const files = fs.readdirSync(dir).filter(f => !ignore.includes(f));
  let tree = "";

  files.forEach((file, index) => {
    const fullPath = path.join(dir, file);
    const isLast = index === files.length - 1;
    const pointer = isLast ? "└── " : "├── ";

    tree += prefix + pointer + file + "\n";

    if (fs.statSync(fullPath).isDirectory()) {
      const newPrefix = prefix + (isLast ? "    " : "│   ");
      tree += generateTree(fullPath, newPrefix, ignore);
    }
  });

  return tree;
}

const projectDir = ".";
const tree = generateTree(projectDir);
fs.writeFileSync("struktur_project.txt", tree);
console.log("✅ Struktur project berhasil diexport ke struktur_project.txt (tanpa node_modules)");
