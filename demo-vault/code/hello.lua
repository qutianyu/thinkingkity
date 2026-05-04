-- Lua example: basic syntax & table operations

local function greet(name)
  return string.format("Hello, %s!", name)
end

-- Tables are the only data structure in Lua
local user = {
  name = "ThinkingKity",
  version = "0.3.0",
  tags = { "desktop", "knowledge-base", "markdown" },
}

-- Iterator with ipairs (array part)
print(greet(user.name))
for i, tag in ipairs(user.tags) do
  print(i, tag)
end

-- Metatable example
local mt = {
  __add = function(a, b)
    return { x = a.x + b.x, y = a.y + b.y }
  end,
}
local v1 = setmetatable({ x = 1, y = 2 }, mt)
local v2 = setmetatable({ x = 3, y = 4 }, mt)
local v3 = v1 + v2
print(v3.x, v3.y) -- 4, 6
