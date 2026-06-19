---
title: Python3 核心概念回顾
published: 2026-02-25
description: 回顾 Python3 中字典、列表、函数、模块、推导式、迭代器、生成器、装饰器等核心概念。
tags: [Python, 编程基础]
category: 编程语言
draft: false
---

## python回顾

字典（键与值一一对应），列表（自由的数组），元组（只读列表，成员不变）
列表需要注意的是extend，appendix，pop等
字典（列表不可以作为键，因为其需要不可变）

### 函数

函数中需要理解的一点是变量与类型的区别：类型是真实存在的，变量只不过的指向类型的标签，所以python中的变量才可以自由变换。
也是因此所以可变和不可变变量的根本区别是：
修改可变变量的时候，是修改了类型本身，而修改不可变变量的时候，是修改了标签所引用的对象
对象有类型，变量无类型

##### 局部变量与全局变量

局部标签与全局标签，可以使用global进行遮蔽

##### 参数

必备参数
关键字参数
这两个区别主要是传参的时候有没有显式的写出，如果没有，就会按照必备参数一个个按顺序填，关键字参数则可以在顺序不对的时候也自动匹配填入
可变参数
使用 * args把所有参数吸收
默认参数
如果不传就用默认值

### 模块

不要用from...import*（命名空间污染）
直接import的时候，加入库名称.函数
补充__name__函数
一个模块被另一个程序第一次引入时，其主程序将运行。

如果我们想在模块被引入时，模块中的某一程序块不执行，我们可以用 __name__ 属性来使该程序块仅在该模块自身运行时执行。

```python
#!/usr/bin/python3
# Filename: using_name.py

if __name__ == '__main__':
   print('程序自身在运行')
else:
   print('我来自另一模块')
```

运行输出如下：

```
$ python using_name.py
程序自身在运行

$ python
>>> import using_name
我来自另一模块
```

说明：每个模块都有一个 `__name__` 属性。

- 如果模块是被直接运行，`__name__` 的值为 `__main__`。
- 如果模块是被导入的，`__name__` 的值为模块名。

### 推导式

```python
# 列表
[out_exp_res for out_exp in input_list if condition]
[函数 for 变量 in 列表 if 条件]

# 字典
{ key_expr: value_expr for value in collection if condition }

# 集合
{ expression for item in Sequence if conditional }

# 元组
(expression for item in Sequence if conditional)
```

### 迭代器与生成器

#### iter()

创建迭代器对象

#### next()

迭代器循环，可以使用 `raise StopIteration` 来结束迭代

#### 生成器

##### yield

- **产出值并暂停：** 当程序执行到 `yield` 时，它会向调用者返回 `yield` 后面的值，然后**立刻暂停**在这一行代码，停止向下执行。
- **保留运行状态：** 函数被暂停时，它内部所有的变量状态、指令指针等都会被完整保留下来。
- **恢复执行：** 当我们下次再调用 `next()` 方法请求数据时，代码会从上次 `yield` 暂停的地方**紧接着往下执行**，直到遇到下一个 `yield`

```python
def countdown(n):
    while n > 0:
        yield n
        n -= 1

# 创建生成器对象
generator = countdown(5)

# 通过迭代生成器获取值
print(next(generator))  # 输出: 5
print(next(generator))  # 输出: 4
print(next(generator))  # 输出: 3

# 使用 for 循环迭代生成器
for value in generator:
    print(value)  # 输出: 2 1
```

### with 语句

使用with来管理资源分布

想要使用with的对象需要有`__enter__` 和`__exit__`方法，帮助自动处理与释放资源

```python
# 同时打开多个文件
with open('input.txt', 'r') as infile, open('output.txt', 'w') as outfile:
    content = infile.read()
    outfile.write(content.upper())
```

#### 最佳实践

1. **优先使用 with 管理资源**：对于文件、网络连接、锁等资源，总是优先考虑使用 `with` 语句
2. **保持上下文简洁**：`with` 块中的代码应该只包含与资源相关的操作
3. **合理处理异常**：在自定义上下文管理器中，根据需求决定是否抑制异常
4. **利用多个上下文**：Python 允许在单个 `with` 语句中管理多个资源

### lambda

```python
lambda arguments: expression
```

```python
numbers = [1, 2, 3, 4, 5]
squared = list(map(lambda x: x**2, numbers))
print(squared)  # 输出: [1, 4, 9, 16, 25]
```

### 装饰器

#### 函数装饰器

Python 装饰器允许在不修改原有函数代码的基础上，动态地增加或修改函数的功能，装饰器本质上是一个接收函数作为输入并返回一个新的包装过后的函数的对象。
本质上是接收函数返回wrapper

```python
def my_decorator(func):
    def wrapper():
        print("在原函数之前执行")
        func()
        print("在原函数之后执行")
    return wrapper

@my_decorator
def say_hello():
    print("Hello!")

say_hello()
```

疑问：return在这里起什么作用？
外层return是my_decorator，作用是把被装饰函数替换成wrapper函数。

- 加上括号 `wrapper()`：意思是"立刻执行这个函数，并把执行后的**结果**交出去"。
- 不加括号 `wrapper`：意思是"我不执行它，我把这个函数的**本体（遥控器）**直接交出去"。

```python
def my_decorator(func):
    # 这里是外层函数
    print("【额外逻辑】我在定义时就被执行了！")
    return func  # 只能把原函数原封不动地退回去

@my_decorator
def greet(name):
    print(f"Hello, {name}!")

# 当代码运行到上面 @my_decorator 那里时，屏幕上就已经打印了：
# 【额外逻辑】我在定义时就被执行了！

# 等你真正在下面调用函数时：
greet("Alice")
greet("Bob")

# 屏幕上只会输出：
# Hello, Alice!
# Hello, Bob!
```

一般来说，这一块最关键的就是一个 return，和一个内部的内置函数wrapper()，在被定义的时候呢，它这个被装饰 F 就可以执行它这个里特，并且反将被装饰 F 替换成装饰后的函数。
然后以后的话，当我们调用被装饰函数的时候，就是默认被替换成装饰后函数。遵循里面的逻辑，这个装饰后函数我们一般使用就是wrapper

所以在使用可变参数传参的时候，应该遵循这样一个原则：

**1. `*args` (Arguments：位置参数打包器)**

- **作用：** 负责把所有按顺序传入的参数，打包成一个**元组 (Tuple)**。
- **示例：** 如果你调用 `func("Alice", 25, "Beijing")`，那么在函数内部，`args` 就会变成 `("Alice", 25, "Beijing")`。

**2. `**kwargs` (Keyword Arguments：关键字参数打包器)**

- **作用：** 负责把所有带有名字的参数（如 `name="Alice"`），打包成一个**字典 (Dictionary)**。
- **示例：** 如果你调用 `func(name="Alice", age=25)`，那么在函数内部，`kwargs` 就会变成 `{"name": "Alice", "age": 25}`。

#### 类的装饰器

| **概念** | **核心标志** | **作用目标** | **核心优势** |
|---|---|---|---|
| **类装饰器 (用类写)** | 实现 `__init__` 和 `__call__` | 装饰普通的函数 | 极其擅长管理复杂的**状态**（如计数、缓存）。|
| **装饰类的装饰器** | 接收参数 `cls` 代替 `func` | 装饰一个 Class | 批量给类**动态添加属性或方法**，减少重复的模板代码。|

`__call__` 等于 wrapper

```python
class Retry:
    def __init__(self, max_times=3):
        # 1. 装配阶段的第一步：记录装饰器传进来的参数
        print(f"【初始化】设置最大重试次数为: {max_times}")
        self.max_times = max_times

    def __call__(self, func):
        # 2. 装配阶段的第二步：接收原函数，并制造替身
        print(f"【装配时】正在给函数 {func.__name__} 穿上重试外套...")

        def wrapper(*args, **kwargs):
            # 3. 调用阶段：真正的重试逻辑
            for attempt in range(1, self.max_times + 1):
                try:
                    print(f"  -> 第 {attempt} 次尝试执行...")
                    result = func(*args, **kwargs)
                    print("  -> 执行成功！")
                    return result  # 成功就直接返回结果，结束循环

                except Exception as e:
                    print(f"  -> 失败了，错误原因: {e}")

            print(f"❌ 警告：已达到最大重试次数 {self.max_times}，彻底放弃。")

        return wrapper  # 把替身交出去

# === 使用场景 ===
print("---- 代码开始加载 ----")

@Retry(max_times=3)
def unstable_network_request():
    # 模拟一个不稳定的网络请求，我们让它故意报错
    raise ConnectionError("网络波动，连接超时！")

print("\n---- 准备调用 ----")
unstable_network_request()
```

注意这里存在的身份信息问题：

```python
def my_decorator(func):
    @wraps(func)  # 用这个让wrap继承身份信息
    def wrapper(*args, **kwargs):
        """我是 wrapper 函数的注释"""
        return func(*args, **kwargs)
    return wrapper

@my_decorator
def calculate_tax(amount):
    """这是一个用来计算税务的复杂核心函数"""
    return amount * 0.2

# 此时我们想打印一下函数的名字和注释文档
print(calculate_tax.__name__)
print(calculate_tax.__doc__)
```

| **装饰器** | **第一个参数** | **能否访问实例属性 (self.xxx)?** | **能否访问类属性 (cls.xxx)?** | **最常见使用场景** |
|---|---|---|---|---|
| **(普通方法)** | `self` (实例) | ✅ 能 | ✅ 能 (通过 `self.__class__`) | 操作或修改单个对象的具体状态。|
| **`@property`** | `self` (实例) | ✅ 能 | ✅ 能 | 把方法伪装成只读属性，动态计算值或保护数据。|
| **`@classmethod`** | `cls` (类) | ❌ 不能 | ✅ 能 | 作为"备用构造函数"，或修改全局类状态。|
| **`@staticmethod`** | (无固定参数) | ❌ 不能 | ❌ 不能 | 编写与类逻辑相关，但纯独立的工具函数。|
