// Groovy example: closures, collections & builders

def greet = { name -> "Hello, ${name}!" }
println greet("ThinkingKity")

// List & map literals
def projects = ["Tauri", "React", "Milkdown"]
def meta = [
  name  : "ThinkingKity",
  stack : projects,
  active: true,
]

projects.eachWithIndex { proj, i ->
  println "${i + 1}. ${proj}"
}

// Safe navigation & Elvis operator
def config = null
def lang = config?.language ?: "zh-CN"
println "Language: ${lang}"

// MarkupBuilder (no imports needed)
def writer = new StringWriter()
def xml = new groovy.xml.MarkupBuilder(writer)
xml.person {
  name("Alice")
  role("Engineer")
}
println writer.toString()
