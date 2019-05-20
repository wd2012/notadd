import { MethodDeclaration, SourceFile, EnumDeclaration, InterfaceDeclaration, Project, MethodDeclarationStructure } from 'ts-morph'
import { clearReturnType } from './util';
import { upperFirst } from 'lodash';
export class ProtobufCreater {
    static _message: Map<string, InterfaceDeclaration> = new Map();
    static _service: Map<string, Map<string, MethodDeclaration>> = new Map();
    static _enum: Map<string, EnumDeclaration> = new Map();
    createMessage(name: string, file: SourceFile) {
        name = clearReturnType(name)
        if (typeof name === 'string') {
            const inter = file.getInterface(name);
            if (inter) {
                ProtobufCreater._message.set(name, inter);
                // 检查复合对象
                const properties = inter.getProperties();
                properties.map(pro => {
                    const struct = pro.getStructure();
                    const type = struct.type as string;
                    // 检查数组
                    if (type.endsWith('[]')) {
                        const tName = type.replace('[]', '')
                        this.createMessage(tName, file)
                    } else if (type.indexOf('|')) {
                        const types = type.split('|');
                        types.map(t => {
                            this.createMessage(t, file)
                        });
                    } else {
                        this.createMessage(type, file)
                    }
                })
            }
            const _enum = file.getEnum(name);
            if (_enum) {
                ProtobufCreater._enum.set(name, _enum)
            }
        }
    }

    createService(name: string, mth: MethodDeclaration, file: SourceFile, project: Project) {
        const structure = mth.getStructure() as MethodDeclarationStructure;
        const parameters = mth.getParameters();
        parameters.map(par => {
            const structure = par.getStructure();
            this.createMessage(structure.type as string, file)
        });
        this.createMessage(structure.returnType as string, file)
        const service = ProtobufCreater._service.get(name) || new Map();
        service.set(structure.name, mth)
        ProtobufCreater._service.set(name, service)
    }

    create() {
        let message = ``, service = ``, _enum = ``;
        if (ProtobufCreater._message.size > 0) {
            message += createMessage(ProtobufCreater._message);
        }
        if (ProtobufCreater._service.size > 0) {
            service += createService(ProtobufCreater._service)
        }
        if (ProtobufCreater._enum.size > 0) {
            _enum += createEnum(ProtobufCreater._enum)
        }
        return `syntax = "proto3";\npackage notadd;\n${_enum}\n${message}\n${service}\n`
    }
}

function transformType(type: string) {
    switch (type) {
        case 'number':
            return 'int32';
        default:
            return type;
    }
}

function createMessage(_message: Map<string, InterfaceDeclaration>) {
    let code = ``;
    _message.forEach(item => {
        const structure = item.getStructure();
        code += `message ${structure.name}{\n`
        const properties = item.getProperties();
        properties.map((pro, index) => {
            const struct = pro.getStructure();
            const type = struct.type as string;

            if (type.endsWith('[]')) {
                const tName = (struct.type as string).replace('[]', '')
                const typeName = transformType(tName)
                code += `\trepeated ${typeName} ${struct.name} = ${index + 1}`
                code += `;\n`;
            } else {
                code += `\t${transformType(struct.type as string)} ${struct.name} = ${index + 1}`
                code += `;\n`
            }
        })
        code += `}\n`
    })
    return code;
}

function createEnum(_enum: Map<string, EnumDeclaration>) {
    let code = ``;
    _enum.forEach((e, name) => {
        code += `enum ${name} {\n`
        const members = e.getMembers();
        members.map((m, index) => {
            const struct = m.getStructure();
            code += `\t${struct.name} = ${index};\n`
        });
        code += `}\n`
    });
    return code;
}

function createService(_service: Map<string, Map<string, MethodDeclaration>>) {
    let code = ``;
    _service.forEach((items, serviceName) => {
        code += `service ${serviceName}{\n`;
        items.forEach(item => {
            const structure = item.getStructure() as MethodDeclarationStructure;
            code += `\trpc ${upperFirst(structure.name)} (`;
            let parameters = item.getParameters();
            parameters.map((pro, index) => {
                const struct = pro.getStructure();
                code += `${struct.type}`
                if (index !== parameters.length - 1) {
                    code += `,`
                }
            })
            code += `) returns (${clearReturnType(structure.returnType)});\n`;
        });
        code += `}`
        code += `\n`;
    });
    return code
}
