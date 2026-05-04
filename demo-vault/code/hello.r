# R example: data analysis & visualization basics

# Vectorized operations
values <- c(1, 2, 3, 4, 5)
squared <- values^2
mean_val <- mean(values)
sd_val <- sd(values)

cat(sprintf("Mean: %.2f, SD: %.2f\n", mean_val, sd_val))

# Data frame
df <- data.frame(
  name = c("Alice", "Bob", "Carol"),
  score = c(92, 85, 78),
  grade = c("A", "B", "C"),
  stringsAsFactors = FALSE
)

# Filter with subset
top_students <- subset(df, score >= 85)
print(top_students)

# Simple linear model
x <- 1:10
y <- 2 * x + rnorm(10, sd = 2)
model <- lm(y ~ x)
print(summary(model))
